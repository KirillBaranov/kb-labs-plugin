/**
 * @module @kb-labs/plugin-manifest/schema
 * Zod validation schemas for Manifest v2
 */

import { z } from 'zod';
import type {
  ManifestV2,
  PermissionSpec,
  InvokePermission,
  ArtifactAccess,
  SchemaRef,
  ArtifactDecl,
  CliFlagDecl,
  CliCommandDecl,
  ErrorSpec,
  RestRouteDecl,
  StudioWidgetDecl,
  StudioMenuDecl,
  StudioLayoutDecl,
} from './types.js';

/**
 * Schema reference validation (only two formats allowed)
 */
export const schemaRefSchema: z.ZodType<SchemaRef> = z.union([
  z.object({
    $ref: z.string().min(1),
  }),
  z.object({
    zod: z.string().min(1),
  }),
]);

/**
 * Invoke permission schema
 */
export const invokePermissionSchema: z.ZodType<InvokePermission> = z.object({
  plugins: z.array(z.string()).optional(),
  routes: z
    .array(
      z.object({
        target: z.string(),
      })
    )
    .optional()
    .refine(
      (routes) => {
        if (!routes) return true;
        return routes.every((r) =>
          /^@[^:]+:(GET|POST|PUT|PATCH|DELETE) \/.+$/.test(r.target)
        );
      },
      { message: 'Route target must be in format @pluginId:METHOD /path' }
    ),
  deny: z
    .array(
      z.object({
        target: z.string(),
      })
    )
    .optional(),
}) as z.ZodType<InvokePermission>;

/**
 * Artifact access schema
 */
export const artifactAccessSchema: z.ZodType<ArtifactAccess> = z.object({
  read: z
    .array(
      z.object({
        from: z.union([z.literal('self'), z.string()]),
        paths: z.array(z.string()),
        allowedTypes: z.array(z.string()).optional(),
      })
    )
    .optional(),
  write: z
    .array(
      z.object({
        to: z.union([z.literal('self'), z.string()]),
        paths: z.array(z.string()),
      })
    )
    .optional(),
});

/**
 * Permission specification with detailed fs/net/env/quotas controls
 */
export const permissionSpecSchema: z.ZodType<PermissionSpec> = z.object({
  fs: z
    .object({
      mode: z.enum(['none', 'read', 'readWrite']),
      allow: z.array(z.string()).optional(),
      deny: z.array(z.string()).optional(),
    })
    .optional(),
  net: z
    .union([
      z.literal('none'),
      z.object({
        allowHosts: z.array(z.string()).optional(),
        denyHosts: z.array(z.string()).optional(),
        allowCidrs: z.array(z.string()).optional(),
        timeoutMs: z.number().int().positive().optional(),
      }),
    ])
    .optional(),
  env: z
    .object({
      allow: z.array(z.string()).optional(),
    })
    .optional(),
  quotas: z
    .object({
      timeoutMs: z.number().int().positive().optional(),
      memoryMb: z.number().int().positive().optional(),
      cpuMs: z.number().int().positive().optional(),
    })
    .optional(),
  capabilities: z.array(z.string()).optional(),
  invoke: invokePermissionSchema.optional(),
  artifacts: artifactAccessSchema.optional(),
});

/**
 * Artifact declaration schema
 */
export const artifactDeclSchema: z.ZodType<ArtifactDecl> = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  pathTemplate: z.string().min(1),
  schemaRef: schemaRefSchema.optional(),
});

/**
 * CLI flag declaration schema
 */
export const cliFlagDeclSchema: z.ZodType<CliFlagDecl> = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'boolean', 'number', 'array']),
  alias: z.string().optional(),
  default: z.unknown().optional(),
  description: z.string().optional(),
  choices: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

/**
 * CLI command declaration schema
 */
export const cliCommandDeclSchema: z.ZodType<CliCommandDecl> = z.object({
  id: z.string().min(1),
  group: z.string().optional(),
  describe: z.string().min(1),
  longDescription: z.string().optional(),
  flags: z.array(cliFlagDeclSchema),
  examples: z.array(z.string()).optional(),
  handler: z.string().min(1),
});

/**
 * Error specification schema
 */
export const errorSpecSchema: z.ZodType<ErrorSpec> = z.object({
  code: z.string().min(1),
  http: z.number().int().min(400).max(599),
  description: z.string().optional(),
});

/**
 * REST route declaration schema
 */
export const restRouteDeclSchema: z.ZodType<RestRouteDecl> = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1),
  input: schemaRefSchema.optional(),
  output: schemaRefSchema,
  errors: z.array(errorSpecSchema).optional(),
  handler: z.string().min(1),
  security: z.array(z.enum(['none', 'user', 'token', 'oauth'])).optional(),
  permissions: permissionSpecSchema.optional(),
});

/**
 * Data source schema
 */
export const dataSourceSchema: z.ZodType<
  import('./types.js').DataSource
> = z.union([
  z.object({
    type: z.literal('rest'),
    routeId: z.string().min(1),
    method: z.enum(['GET', 'POST']).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal('mock'),
    fixtureId: z.string().min(1),
  }),
]);

/**
 * Studio widget declaration schema
 */
export const studioWidgetDeclSchema: z.ZodType<StudioWidgetDecl> = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'panel',
    'card',
    'table',
    'chart',
    'tree',
    'timeline',
    'metric',
    'logs',
    'json',
    'diff',
    'status',
    'progress',
  ]),
  title: z.string().min(1),
  description: z.string().optional(),
  data: z.object({
    source: dataSourceSchema,
    schema: schemaRefSchema,
  }),
  options: z.record(z.string(), z.unknown()).optional(),
  layoutHint: z
    .object({
      w: z.number().int().positive(),
      h: z.number().int().positive(),
      minW: z.number().int().positive().optional(),
      minH: z.number().int().positive().optional(),
    })
    .optional(),
  pollingMs: z.number().int().nonnegative().optional(),
  component: z.string().min(1).optional(),
  condition: z.string().optional(),
  order: z.number().int().optional(),
});

/**
 * Studio menu declaration schema
 */
export const studioMenuDeclSchema: z.ZodType<StudioMenuDecl> = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  target: z.string().min(1),
  order: z.number().int().optional(),
});

/**
 * Studio layout declaration schema
 */
export const studioLayoutDeclSchema: z.ZodType<StudioLayoutDecl> = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['grid', 'two-pane']),
    title: z.string().min(1),
    description: z.string().optional(),
    name: z.string().optional(),
    template: z.string().optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .refine(
    (data) => {
      // For grid layout, config must have cols and rowHeight
      if (data.kind === 'grid' && data.config) {
        const config = data.config;
        return (
          typeof config.cols === 'object' &&
          config.cols !== null &&
          typeof config.rowHeight === 'number'
        );
      }
      return true;
    },
    {
      message:
        'Grid layout requires config with cols (object) and rowHeight (number)',
      path: ['config'],
    }
  );

/**
 * Manifest v2 schema
 */
export const manifestV2Schema: z.ZodType<ManifestV2> = z.object({
  schema: z.literal('kb.plugin/2'),
  id: z.string().min(1),
  version: z.string().min(1),
  display: z
    .object({
      name: z.string().min(1),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .optional(),
  capabilities: z.array(z.string()).optional(),
  permissions: permissionSpecSchema.optional(),
  artifacts: z.array(artifactDeclSchema).optional(),
  cli: z
    .object({
      commands: z.array(cliCommandDeclSchema).min(1),
    })
    .optional(),
  rest: z
    .object({
      basePath: z
        .string()
        .regex(/^\/v1\/plugins\/[^/]+$/)
        .optional()
        .refine(
          (val) => val === undefined || val.startsWith('/v1/plugins/'),
          { message: 'basePath must start with /v1/plugins/' }
        ),
      routes: z.array(restRouteDeclSchema).min(1),
    })
    .optional()
    .transform((val) => {
      if (!val) return undefined;
      return {
        ...val,
        basePath: val.basePath as `/v1/plugins/${string}` | undefined,
      };
    }),
  studio: z
    .object({
      widgets: z.array(studioWidgetDeclSchema).min(1),
      menus: z.array(studioMenuDeclSchema).optional(),
      layouts: z.array(studioLayoutDeclSchema).optional(),
    })
    .optional(),
});

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: z.ZodError[];
}

/**
 * Validate Manifest v2
 */
export function validateManifestV2(
  manifest: unknown
): ValidationResult {
  const result = manifestV2Schema.safeParse(manifest);

  if (result.success) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: [result.error],
  };
}
