/**
 * @module @kb-labs/plugin-adapter-rest/handler
 * Handler binding and execution for REST routes
 */

import type {
  ManifestV2,
  RestRouteDecl,
} from '@kb-labs/plugin-manifest';
import type {
  ExecutionContext,
  HandlerRef,
} from '@kb-labs/plugin-runtime';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  execute as runtimeExecute,
  createId,
  createPluginContextWithPlatform,
  OperationTracker,
  HttpPresenter,
} from '@kb-labs/plugin-runtime';
import type { PluginRegistry } from '@kb-labs/plugin-runtime';
import * as path from 'node:path';
import type { 
  RestHandlerContext, 
  AdapterMetadata,
} from '@kb-labs/core-sandbox';
import { 
  ADAPTER_TYPES, 
  validateAdapterMetadata,
  CURRENT_CONTEXT_VERSION,
} from '@kb-labs/core-sandbox';

/**
 * Parse handlerRef from string format (e.g., './rest/review.js#handle')
 */
function parseHandlerRef(handlerRef: string): HandlerRef {
  const [file, exportName] = handlerRef.split('#');
  if (!exportName || !file) {
    throw new Error(`Handler reference must include export name: ${handlerRef}`);
  }
  return { file, export: exportName };
}

/**
 * Create execution context from route declaration
 */
function createExecutionContext(
  route: RestRouteDecl,
  manifest: ManifestV2,
  requestId: string,
  basePath: string,
  pluginRoot: string,
  workdir: string,
  outdir?: string
): ExecutionContext {
  const fullPath = route.path.startsWith(basePath)
    ? route.path
    : `${basePath}${route.path}`;

  return {
    requestId,
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    routeOrCommand: `${route.method} ${fullPath}`,
    workdir,
    outdir: outdir || path.join(workdir, 'out'),
    pluginRoot,
    debug: process.env.KB_PLUGIN_DEV_MODE === 'true',
    tmpFiles: [],
  };
}

/**
 * Extract input from request based on HTTP method
 */
function extractInput(
  request: FastifyRequest,
  method: string
): Record<string, unknown> {
  // GET/PATCH/DELETE: query parameters
  if (method === 'GET' || method === 'DELETE') {
    return request.query as Record<string, unknown>;
  }

  // POST/PUT/PATCH: request body
  return (request.body as Record<string, unknown>) || {};
}

/**
 * Execute route handler
 */
export async function executeRoute(
  route: RestRouteDecl,
  manifest: ManifestV2,
  request: FastifyRequest,
  reply: FastifyReply,
  grantedCapabilities: string[],
  basePath: string,
  pluginRoot?: string,
  workdir?: string,
  outdir?: string,
  registry?: PluginRegistry,
  timeoutMs?: number
): Promise<void> {
  const requestId = (request.id || createId()) as string;
  
  // Generate or extract traceId from header
  const traceId = (request.headers['x-trace-id'] as string) || createId();
  
  // Default plugin root (where manifest is located) - required
  if (!pluginRoot) {
    throw new Error('pluginRoot is required for REST route execution');
  }
  const defaultPluginRoot = pluginRoot;
  const defaultWorkdir = workdir || defaultPluginRoot;
  const defaultOutdir = outdir || path.join(defaultWorkdir, 'out');

  const presenter = new HttpPresenter();
  const operationTracker = new OperationTracker();

  // Create PluginContext with automatic platform integration
  const pluginContext = createPluginContextWithPlatform({
    host: 'rest',
    requestId,
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    ui: presenter,
    metadata: {
      method: route.method,
      path: route.path,
      basePath,
      getTrackedOperations: () => operationTracker.toArray(),
    },
  });

  const execCtx = createExecutionContext(
    route,
    manifest,
    requestId,
    basePath,
    defaultPluginRoot,
    defaultWorkdir,
    defaultOutdir
  );
  execCtx.pluginContext = pluginContext;
  execCtx.operationTracker = operationTracker;

  const headerState = (request as any).kbHeaderState as
    | {
        sanitized?: Record<string, string>;
        sensitive?: Set<string>;
        rateLimitKeys?: Record<string, string>;
      }
    | undefined;
  if (headerState) {
    const ctxWithHeaders = execCtx as typeof execCtx & {
      headers?: {
        inbound: Record<string, string>;
        sensitive?: string[];
        rateLimitKeys?: Record<string, string>;
      };
    };
    ctxWithHeaders.headers = {
      inbound: { ...(headerState.sanitized ?? {}) },
      sensitive: headerState.sensitive ? Array.from(headerState.sensitive) : undefined,
      rateLimitKeys: headerState.rateLimitKeys
        ? { ...headerState.rateLimitKeys }
        : undefined,
    };
  }

  // Add traceId to context
  execCtx.traceId = traceId;
  
  // Set context version
  execCtx.version = CURRENT_CONTEXT_VERSION;
  
  // Create adapter metadata
  const adapterMeta: AdapterMetadata = {
    type: ADAPTER_TYPES.REST,
    signature: 'request',
    version: '1.0.0',
    meta: {
      // Future REST-specific metadata
    },
  };
  validateAdapterMetadata(adapterMeta);
  execCtx.adapterMeta = adapterMeta;
  
  // Create typed adapter context
  const adapterContext: RestHandlerContext = {
    type: 'rest',
    request: request,
    requestId: execCtx.requestId,
    workdir: execCtx.workdir,
    outdir: execCtx.outdir,
    pluginId: execCtx.pluginId,
    pluginVersion: execCtx.pluginVersion,
    traceId: execCtx.traceId,
    spanId: execCtx.spanId,
    parentSpanId: execCtx.parentSpanId,
    debug: execCtx.debug,
  };
  execCtx.adapterContext = adapterContext;

  // Extract input
  const input = extractInput(request, route.method);

  // Parse handler reference
  const handlerRef = parseHandlerRef(route.handler);

  // Resolve permissions (merge manifest permissions with system policy)
  const perms = manifest.permissions || {};

  // Execute via runtime with registry
  type RuntimeResult = Awaited<ReturnType<typeof runtimeExecute>>;
  const runtimePromise = runtimeExecute(
    {
      handler: handlerRef,
      input,
      manifest,
      perms,
    },
    execCtx,
    registry
  );

  let timeoutHandle: NodeJS.Timeout | undefined;
  let timedOut = false;

  let result: RuntimeResult;
  if (timeoutMs && timeoutMs > 0) {
    const timeoutPromise = new Promise<RuntimeResult>(resolve => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        const timeoutResult = {
          ok: false,
          error: {
            status: 'error',
            http: 504,
            code: 'E_PLUGIN_TIMEOUT',
            message: `Route ${route.method} ${route.path} exceeded timeout of ${timeoutMs}ms`,
            meta: {
              requestId,
              pluginId: manifest.id,
              pluginVersion: manifest.version,
              routeOrCommand: route.path,
              timeoutMs,
              timeMs: timeoutMs,
            },
          },
          metrics: {
            timeMs: timeoutMs,
          },
        } as RuntimeResult;
        resolve(timeoutResult);
      }, timeoutMs);
    });
    result = await Promise.race([runtimePromise, timeoutPromise]);
  } else {
    result = await runtimePromise;
  }

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }

  if (timedOut) {
    runtimePromise.catch(error => {
      request.log.warn({ err: error }, 'Plugin execution completed after timeout');
    });
    if (timeoutMs && timeoutMs > 0) {
      reply.header('Retry-After', Math.max(1, Math.ceil(timeoutMs / 1000)).toString());
    }
  }

  if (!result.ok) {
    // Error - send ErrorEnvelope
    // Default to 500 if http status is not provided
    const errorStatusCode = result.error.http || 500;
    reply.status(errorStatusCode).send(result.error);
    return;
  }

  // Success - send response with metrics
  const statusCode = route.method === 'POST' ? 201 : 200;
  await reply.status(statusCode).send({
    status: 'ok',
    data: result.data,
    meta: {
      requestId,
      durationMs: result.metrics.timeMs,
      apiVersion: '1.0',
    },
  });
}
