/**
 * @module @kb-labs/plugin-adapter-rest/handler
 * Handler binding and execution for REST routes
 */

import type {
  ManifestV2,
  RestRouteDecl,
} from '@kb-labs/plugin-manifest';
import type {
  HandlerRef,
} from '@kb-labs/plugin-runtime';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  executePlugin,
  createId,
  createPluginContextWithPlatform,
  OperationTracker,
  HttpPresenter,
} from '@kb-labs/plugin-runtime';
import type { PluginRegistry } from '@kb-labs/plugin-runtime';
import * as path from 'node:path';

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

  // Extract header state for metadata
  const headerState = (request as any).kbHeaderState as
    | {
        sanitized?: Record<string, string>;
        sensitive?: Set<string>;
        rateLimitKeys?: Record<string, string>;
      }
    | undefined;

  // Create PluginContext with automatic platform integration
  const pluginContext = createPluginContextWithPlatform({
    host: 'rest',
    requestId,
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    cwd: defaultWorkdir,      // V2: promoted to top-level
    outdir: defaultOutdir,     // V2: promoted to top-level
    ui: presenter,
    metadata: {
      // V2: Only REST-specific metadata remains
      method: route.method,
      path: route.path,
      basePath,
      traceId,
      headers: headerState ? {
        inbound: { ...(headerState.sanitized ?? {}) },
        sensitive: headerState.sensitive ? Array.from(headerState.sensitive) : undefined,
        rateLimitKeys: headerState.rateLimitKeys ? { ...headerState.rateLimitKeys } : undefined,
      } : undefined,
      request, // Add Fastify request to metadata for handlers that need it
      getTrackedOperations: () => operationTracker.toArray(),
    },
  });

  // Extract input
  const input = extractInput(request, route.method);

  // Parse handler reference
  const handlerRef = parseHandlerRef(route.handler);

  // Resolve permissions (merge manifest permissions with system policy)
  const perms = manifest.permissions || {};

  // Execute via new executePlugin architecture
  const distRoot = path.join(defaultPluginRoot, 'dist');

  // Define RuntimeResult type for REST responses
  type RuntimeResult = {
    ok: boolean;
    data?: unknown;
    error?: {
      status: string;
      http: number;
      code: string;
      message: string;
      meta?: Record<string, unknown>;
    };
    metrics: {
      timeMs: number;
    };
  };

  const runtimePromise = (async () => {
    try {
      // Execute via executePlugin with REST adapter
      // @see ADR-0015: Execution Adapters Architecture
      const result = await executePlugin({
        context: pluginContext,
        handlerRef,
        argv: [], // REST doesn't use argv
        flags: input, // HTTP request body/query as flags
        manifest,
        permissions: perms,
        grantedCapabilities,
        pluginRoot: distRoot,
        registry,
        executionType: 'rest', // Use REST adapter for correct handler signature
      });

      // Convert ExecutePluginResult to RuntimeResult format
      if (result.ok) {
        return {
          ok: true,
          data: result.data,
          metrics: result.metrics,
        } as RuntimeResult;
      } else {
        return {
          ok: false,
          error: {
            status: 'error',
            http: 500,
            code: result.error?.code || 'E_PLUGIN_ERROR',
            message: result.error?.message || 'Plugin execution failed',
            meta: {
              requestId,
              pluginId: manifest.id,
              pluginVersion: manifest.version,
              routeOrCommand: `${route.method} ${route.path}`,
              ...result.error?.details,
            },
          },
          metrics: result.metrics,
        } as RuntimeResult;
      }
    } catch (error: any) {
      return {
        ok: false,
        error: {
          status: 'error',
          http: 500,
          code: 'E_PLUGIN_ERROR',
          message: error?.message || 'Plugin execution failed',
          meta: {
            requestId,
            pluginId: manifest.id,
            pluginVersion: manifest.version,
            routeOrCommand: `${route.method} ${route.path}`,
          },
        },
        metrics: {
          timeMs: 0,
        },
      } as RuntimeResult;
    }
  })();

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
    const errorStatusCode = result.error?.http || 500;
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
