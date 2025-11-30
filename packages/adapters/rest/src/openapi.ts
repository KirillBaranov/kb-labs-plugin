/**
 * @module @kb-labs/plugin-adapter-rest/openapi
 * OpenAPI spec generation from manifest
 */

import type { ManifestV2, RestRouteDecl, SchemaRef } from '@kb-labs/plugin-manifest';
import { resolveHeaderPolicy } from './header-policy';

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
function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

function generatePath(
  route: RestRouteDecl,
  pluginId: string,
  basePath: string,
  manifest: ManifestV2
): Record<string, unknown> {
  const method = route.method.toLowerCase();
  const pathItem: Record<string, unknown> = {
    summary: route.path,
    operationId: `${pluginId}_${method}_${route.path.replace(/\//g, '_').replace(/^_/, '')}`,
    tags: [pluginId],
  };

  // Request
  const parameters: Array<Record<string, unknown>> = [];

  if (route.input) {
    if (route.method === 'GET' || route.method === 'DELETE') {
      parameters.push(
        {
          name: 'query',
          in: 'query',
          schema: schemaRefToOpenAPI(route.input, pluginId),
        }
      );
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

  const effectiveHeaders = resolveHeaderPolicy(manifest, route, basePath);

  if (effectiveHeaders) {
    const inboundHeaders = effectiveHeaders.inbound.filter(
      (rule) =>
        (rule.direction === undefined || rule.direction === 'in' || rule.direction === 'both') &&
        (rule.action === 'forward' || rule.action === 'map')
    );

    const headerParameters = new Map<string, Record<string, unknown>>();

    for (const rule of inboundHeaders) {
      if (rule.match.kind !== 'exact') {
        continue;
      }
      const headerName = normalizeHeaderName(rule.match.name);

      if (!headerParameters.has(headerName)) {
        headerParameters.set(headerName, {
          name: headerName,
          in: 'header',
          required: Boolean(rule.required),
          schema: { type: 'string' },
          description:
            rule.action === 'map'
              ? `Forwarded and remapped header (server maps to ${rule.mapTo})`
              : 'Forwarded header',
          'x-kb-header-rule': {
            action: rule.action,
            sensitive: Boolean(rule.sensitive),
            cacheVary: Boolean(rule.cacheVary),
            rateLimitKey: Boolean(rule.rateLimitKey),
          },
        });
      } else if (rule.required) {
        headerParameters.get(headerName)!.required = true;
      }
    }

    if (headerParameters.size > 0) {
      parameters.push(...Array.from(headerParameters.values()));
    }

    (pathItem[method] as Record<string, unknown>)['x-kb-headers'] = {
      defaults: effectiveHeaders.defaults,
      allowList: effectiveHeaders.allowList,
      denyList: effectiveHeaders.denyList,
      inbound: inboundHeaders,
      outbound: effectiveHeaders.outbound,
    };
  }

  if (parameters.length > 0) {
    pathItem.parameters = parameters;
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

  if (effectiveHeaders) {
    const successStatus = String(route.method === 'POST' ? 201 : 200);
    const successResponse = responses[successStatus] as Record<string, unknown>;

    const outboundHeaders = effectiveHeaders.outbound.filter(
      (rule) =>
        (rule.direction === undefined || rule.direction === 'out' || rule.direction === 'both') &&
        rule.action === 'forward' &&
        rule.exposeToStudio
    );

    if (outboundHeaders.length > 0) {
      const headers: Record<string, unknown> = {};

      for (const rule of outboundHeaders) {
        if (rule.match.kind !== 'exact') {
          continue;
        }
        const headerName = rule.match.name;
        headers[headerName] = {
          schema: { type: 'string' },
          description: 'Plugin-provided header',
          'x-kb-header-rule': {
            sensitive: Boolean(rule.sensitive),
            cacheVary: Boolean(rule.cacheVary),
          },
        };
      }

      if (Object.keys(headers).length > 0) {
        successResponse.headers = headers;
      }
    }
  }

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

    Object.assign(paths[path], generatePath(route, manifest.id, basePath, manifest));
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

  (spec as unknown as Record<string, unknown>)['x-kb-plugin-id'] = manifest.id;

  if (Object.keys(securitySchemes).length > 0) {
    spec.components = {
      securitySchemes,
    };
  }

  return spec;
}
