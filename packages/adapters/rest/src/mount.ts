/**
 * @module @kb-labs/plugin-adapter-rest/mount
 * Route mounting from manifest
 */

import type { ManifestV2, RestRouteDecl } from '@kb-labs/plugin-manifest';
import type { FastifyInstance } from 'fastify';
import { executeRoute } from './handler.js';
import { resolveSchema, validateData } from './validation.js';
import { createErrorGuard } from './errors.js';

/**
 * Runtime interface for plugin execution
 */
export interface PluginRuntime {
  execute<I, O>(
    handlerRef: string,
    input: I,
    context: any
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
  } = {}
): Promise<void> {
  if (!manifest.rest?.routes) {
    return;
  }

  const grantedCapabilities = options.grantedCapabilities || [];
  const basePath = options.basePath || manifest.rest.basePath || `/v1/plugins/${manifest.id}`;

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
    // Resolve schemas (pluginRoot required)
    if (!options.pluginRoot) {
      throw new Error('pluginRoot is required for route mounting');
    }
    const pluginRoot = options.pluginRoot;
    const inputSchema = await resolveSchema(route.input, pluginRoot);
    const outputSchema = await resolveSchema(route.output, pluginRoot);

    // Create route handler with error guard
    const routeHandler = createErrorGuard(async (request: any, reply: any) => {
      // Validate input
      const input = request.method === 'GET' || request.method === 'DELETE'
        ? request.query
        : request.body;

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
      await executeRoute(
        route,
        manifest,
        request,
        reply,
        grantedCapabilities,
        basePath,
        pluginRoot,
        pluginRoot, // workdir
        undefined // outdir (will use default)
      );

      // Validate output
      const output = reply.payload;
      const outputValidation = validateData(output, outputSchema);
      if (!outputValidation.valid) {
        // Log warning but don't fail (output already sent)
        request.log.warn('Output validation failed:', outputValidation.error?.issues || []);
      }
    });

    // Register route
    // Note: We don't pass schemas to Fastify because:
    // 1. Fastify expects JSON Schema, but we have Zod schemas
    // 2. We do manual validation in the handler using validateData()
    // 3. Fastify schema validation is optional - we handle it ourselves
    app[route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](
      routePath,
      {
        ...(route.security && route.security.length > 0
          ? {
              preHandler: async (request: any, reply: any) => {
                // Security check will be implemented based on security requirements
                // For now, just check if 'none' is not in security array
                if (!route.security?.includes('none')) {
                  // Implement security check here
                  // For now, allow all requests
                }
              },
            }
          : {}),
      },
      routeHandler
    );
  }
}

/**
 * Generate error responses from route declaration
 */
function generateErrorResponses(
  route: RestRouteDecl
): Record<string, unknown> {
  const errorResponses: Record<string, unknown> = {};

  if (route.errors && route.errors.length > 0) {
    for (const errorSpec of route.errors) {
      errorResponses[errorSpec.http] = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['error'] },
          http: { type: 'number' },
          code: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'object' },
        },
      };
    }
  }

  // Always include 500 error response
  errorResponses[500] = {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['error'] },
      http: { type: 'number' },
      code: { type: 'string' },
      message: { type: 'string' },
      details: { type: 'object' },
    },
  };

  return errorResponses;
}
