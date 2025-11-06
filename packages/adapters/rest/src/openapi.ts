/**
 * @module @kb-labs/plugin-adapter-rest/openapi
 * OpenAPI spec generation from manifest
 */

import type { ManifestV2, RestRouteDecl, SchemaRef } from '@kb-labs/plugin-manifest';

/**
 * OpenAPI 3.0 spec structure
 */
export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}

/**
 * Convert schema reference to OpenAPI schema reference
 */
function schemaRefToOpenAPI(
  schemaRef: SchemaRef | undefined,
  pluginId: string
): string | undefined {
  if (!schemaRef) {
    return undefined;
  }

  if ('$ref' in schemaRef) {
    // OpenAPI reference - extract schema name and prefix with plugin ID
    const refPath = schemaRef.$ref;
    if (refPath.startsWith('#/components/schemas/')) {
      const schemaName = refPath.split('/').pop() || '';
      return `#/components/schemas/${pluginId}.${schemaName}`;
    }
    return refPath;
  }

  // Zod reference - would need to convert to OpenAPI schema
  // For now, return undefined (schemas should use $ref format)
  return undefined;
}

/**
 * Generate OpenAPI path from route
 */
function generatePath(
  route: RestRouteDecl,
  pluginId: string,
  basePath: string
): Record<string, unknown> {
  const method = route.method.toLowerCase();
  const pathItem: Record<string, unknown> = {
    summary: route.path,
    operationId: `${pluginId}_${method}_${route.path.replace(/\//g, '_').replace(/^_/, '')}`,
    tags: [pluginId],
  };

  // Request
  if (route.input) {
    if (route.method === 'GET' || route.method === 'DELETE') {
      pathItem.parameters = [
        {
          name: 'query',
          in: 'query',
          schema: schemaRefToOpenAPI(route.input, pluginId),
        },
      ];
    } else {
      pathItem.requestBody = {
        content: {
          'application/json': {
            schema: schemaRefToOpenAPI(route.input, pluginId),
          },
        },
      };
    }
  }

  // Response
  const outputRef = schemaRefToOpenAPI(route.output, pluginId);
  const responses: Record<string, unknown> = {};
  responses[String(route.method === 'POST' ? 201 : 200)] = {
    description: 'Success',
    content: {
      'application/json': {
        schema: outputRef ? { $ref: outputRef } : { type: 'object' },
      },
    },
  };

  // Error responses
  if (route.errors && route.errors.length > 0) {
    for (const errorSpec of route.errors) {
      responses[String(errorSpec.http)] = {
        description: errorSpec.description || errorSpec.code,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['error'] },
                http: { type: 'number' },
                code: { type: 'string' },
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
          },
        },
      };
    }
  }

  // Always include 500 error
  responses['500'] = {
    description: 'Internal server error',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['error'] },
            http: { type: 'number' },
            code: { type: 'string' },
            message: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
    },
  };

  pathItem.responses = responses;

  // Security
  if (route.security && route.security.length > 0) {
    pathItem.security = route.security.map((scheme: string) => {
      if (scheme === 'none') {
        return {};
      }
      return { [scheme]: [] };
    });
  }

  return { [method]: pathItem };
}

/**
 * Generate security schemes from routes
 */
function generateSecuritySchemes(
  routes: RestRouteDecl[]
): Record<string, unknown> {
  const schemes = new Set<string>();

  for (const route of routes) {
    if (route.security) {
      for (const scheme of route.security) {
        if (scheme !== 'none') {
          schemes.add(scheme);
        }
      }
    }
  }

  const securitySchemes: Record<string, unknown> = {};

  for (const scheme of schemes) {
    switch (scheme) {
      case 'user': {
        securitySchemes.user = {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        };
        break;
      }
      case 'token': {
        securitySchemes.token = {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
        };
        break;
      }
      case 'oauth': {
        securitySchemes.oauth = {
          type: 'oauth2',
          flows: {
            authorizationCode: {
              authorizationUrl: '/oauth/authorize',
              tokenUrl: '/oauth/token',
              scopes: {},
            },
          },
        };
        break;
      }
    }
  }

  return securitySchemes;
}

/**
 * Generate OpenAPI spec from manifest
 */
export function generateOpenAPI(manifest: ManifestV2): OpenAPISpec {
  if (!manifest.rest?.routes) {
    throw new Error('Manifest has no REST routes');
  }

  const basePath = manifest.rest.basePath || `/v1/plugins/${manifest.id}`;
  const paths: Record<string, Record<string, unknown>> = {};

  // Generate paths from routes
  for (const route of manifest.rest.routes) {
    const path = route.path.startsWith(basePath)
      ? route.path
      : `${basePath}${route.path}`;

    if (!paths[path]) {
      paths[path] = {};
    }

    Object.assign(paths[path], generatePath(route, manifest.id, basePath));
  }

  // Generate security schemes
  const securitySchemes = generateSecuritySchemes(manifest.rest.routes);

  const spec: OpenAPISpec = {
    openapi: '3.0.0',
    info: {
      title: manifest.display?.name || manifest.id,
      version: manifest.version,
      description: manifest.display?.description,
    },
    paths,
  };

  if (Object.keys(securitySchemes).length > 0) {
    spec.components = {
      securitySchemes,
    };
  }

  return spec;
}
