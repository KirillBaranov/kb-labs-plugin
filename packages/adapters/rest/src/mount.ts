/**
 * @module @kb-labs/plugin-adapter-rest/mount
 * Route mounting from manifest
 */

import type { ManifestV2, RestRouteDecl } from '@kb-labs/plugin-manifest';
import type { FastifyInstance, RouteShorthandOptions, FastifyRequest, FastifyReply } from 'fastify';
import { executeRoute } from './handler.js';
import { resolveSchema, validateData } from './validation.js';
import { createErrorGuard } from './errors.js';
import { resolveWorkspaceRoot } from '@kb-labs/core-workspace';
import {
  resolveHeaderPolicy,
  compileHeaderPolicy,
} from './header-policy.js';

/**
 * Runtime interface for plugin execution
 */
export interface PluginRuntime {
  execute<I, O>(
    handlerRef: string,
    input: I,
    context: Record<string, unknown>
  ): Promise<{ success: boolean; data?: O; error?: unknown }>;
}

/**
 * Mount routes from manifest
 */
export async function mountRoutes(
  app: FastifyInstance,
  manifest: ManifestV2,
  runtime: PluginRuntime,
  options: {
    grantedCapabilities?: string[];
    basePath?: string;
    pluginRoot?: string;
    workdir?: string;
    fallbackTimeoutMs?: number;
    rateLimit?: {
      max: number;
      timeWindow: string;
    };
    onRouteMounted?: (info: {
      method: string;
      path: string;
      timeoutMs: number | null;
      route: RestRouteDecl;
    }) => void;
  } = {}
): Promise<void> {
  if (!manifest.rest?.routes) {
    return;
  }

  const grantedCapabilities = options.grantedCapabilities || [];
  const basePath = options.basePath || manifest.rest.basePath || `/v1/plugins/${manifest.id}`;
  const restConfig = manifest.rest as typeof manifest.rest & {
    defaults?: { timeoutMs?: number };
  };
  const pluginDefaultTimeoutMs = restConfig?.defaults?.timeoutMs;
  const fallbackTimeoutMs = options.fallbackTimeoutMs;

  // Use app.log if available (Fastify instance), otherwise console.log
  const log = app.log || console;
  log.info(`[mountRoutes] Mounting routes for plugin ${manifest.id}@${manifest.version}`);
  log.info(`[mountRoutes] basePath: ${basePath}`);
  log.info(`[mountRoutes] manifest.rest.basePath: ${manifest.rest?.basePath}`);

  if (!options.pluginRoot) {
    throw new Error('pluginRoot is required for route mounting');
  }
  const pluginRoot = options.pluginRoot;

  let workdir = options.workdir;
  if (!workdir) {
    try {
      const resolution = await resolveWorkspaceRoot({
        startDir: pluginRoot,
        env: {
          KB_LABS_WORKSPACE_ROOT: process.env.KB_LABS_WORKSPACE_ROOT,
          KB_LABS_REPO_ROOT: process.env.KB_LABS_REPO_ROOT,
        },
      });
      workdir = resolution.rootDir;
      log.info(
        `[mountRoutes] Resolved workspace root for plugin ${manifest.id}: ${workdir} (source=${resolution.source})`
      );
    } catch (error) {
      log.warn(
        { err: error },
        `[mountRoutes] Failed to resolve workspace root for plugin ${manifest.id}, falling back to plugin root`
      );
      workdir = pluginRoot;
    }
  } else {
    log.info(
      `[mountRoutes] Using provided workdir for plugin ${manifest.id}: ${workdir}`
    );
  }

  // Register each route
  for (const route of manifest.rest.routes) {
    // Combine basePath with route.path
    // route.path is relative (e.g., '/query') or absolute (e.g., '/v1/plugins/mind/query')
    // If route.path is absolute and starts with /v1/plugins/, replace /v1 with basePath prefix
    // Otherwise, append route.path to basePath
    let routePath = route.path;
    if (route.path.startsWith('/v1/plugins/')) {
      // Absolute path starting with /v1/plugins/ - replace /v1 with basePath prefix
      routePath = route.path.replace(/^\/v1/, basePath.split('/v1')[0] || '');
    } else if (route.path.startsWith('/')) {
      // Relative path starting with / - append to basePath
      routePath = `${basePath}${route.path}`;
    } else {
      // Relative path without leading / - append to basePath with /
      routePath = `${basePath}/${route.path}`;
    }
    
    const effectiveWorkdir = workdir ?? pluginRoot;
    const routeConfig = route as RestRouteDecl & { timeoutMs?: number };
    const effectiveTimeoutMs =
      routeConfig.timeoutMs ?? pluginDefaultTimeoutMs ?? fallbackTimeoutMs;

    log.info(`[mountRoutes] Registering route: ${route.method} ${routePath} (from ${route.path})`);
    const inputSchema = await resolveSchema(route.input, pluginRoot);
    const outputSchema = await resolveSchema(route.output, pluginRoot);

    const resolvedHeaderPolicy = resolveHeaderPolicy(manifest, route, basePath);
    const compiledHeaderPolicy = resolvedHeaderPolicy
      ? compileHeaderPolicy(resolvedHeaderPolicy)
      : undefined;

    // Create route handler with error guard
    const routeHandler = createErrorGuard(async (request: FastifyRequest, reply: FastifyReply) => {
      // Validate input
      const input = request.method === 'GET' || request.method === 'DELETE'
        ? request.query
        : (request.body ?? {});

      const inputValidation = validateData(input, inputSchema);
      if (!inputValidation.valid) {
        reply.status(400).send({
          status: 'error',
          http: 400,
          code: 'E_VALIDATION',
          message: 'Input validation failed',
          details: {
            errors: inputValidation.error?.issues || [],
          },
          meta: {
            requestId: request.id || 'unknown',
            pluginId: manifest.id,
            pluginVersion: manifest.version,
            routeOrCommand: route.path,
            timeMs: 0,
          },
        });
        return;
      }

      // Execute route (pluginRoot already validated above)
      // Note: Output validation is done inside executeRoute before sending response
      await executeRoute(
        route,
        manifest,
        request,
        reply,
        grantedCapabilities,
        basePath,
        pluginRoot,
        effectiveWorkdir,
        undefined, // outdir (will use default)
        undefined,
        effectiveTimeoutMs
      );
    });

    // Register route
    // Note: We don't pass schemas to Fastify because:
    // 1. Fastify expects JSON Schema, but we have Zod schemas
    // 2. We do manual validation in the handler using validateData()
    // 3. Fastify schema validation is optional - we handle it ourselves
    const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
    const routeOptions: RouteShorthandOptions = {
      config: {
        ...(options.rateLimit ? { rateLimit: options.rateLimit } : {}),
        kbRouteBudgetMs: effectiveTimeoutMs ?? null,
        pluginId: manifest.id,
        pluginRouteId: route.path,
        kbPluginRoot: pluginRoot,
        ...(compiledHeaderPolicy ? { kbHeaders: compiledHeaderPolicy } : {}),
      },
    } as RouteShorthandOptions;

    if (route.security && route.security.length > 0 && !route.security.includes('none')) {
      routeOptions.preHandler = async () => {
        // Placeholder for future security enforcement
      };
    }

    app[method](routePath, routeOptions, routeHandler);
    
    log.info(`[mountRoutes] Successfully registered route: ${method.toUpperCase()} ${routePath}`);
    if (effectiveTimeoutMs) {
      log.info(
        `[mountRoutes] Timeout for ${method.toUpperCase()} ${routePath}: ${effectiveTimeoutMs}ms`
      );
    }

    options.onRouteMounted?.({
      method: method.toUpperCase(),
      path: routePath,
      timeoutMs: effectiveTimeoutMs ?? null,
      route,
    });
  }
  
  log.info(`[mountRoutes] Finished mounting ${manifest.rest.routes.length} routes for plugin ${manifest.id}`);
}

