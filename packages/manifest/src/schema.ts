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
  HeaderMatch,
  HeaderRule,
  HeaderPolicy,
  HeadersConfig,
  SecurityHeaders,
  StudioWidgetDecl,
  StudioMenuDecl,
  StudioLayoutDecl,
  JobDecl,
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
      }).refine(
        (value) =>
          !value.allowHosts || value.allowHosts.length > 0,
        {
          message: 'allowHosts must include at least one host entry',
          path: ['allowHosts'],
        },
      ),
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
  shell: z
    .object({
      allow: z.array(z.union([z.string(), z.object({
        command: z.string(),
        args: z.array(z.string()).optional(),
      })])),
      deny: z.array(z.union([z.string(), z.object({
        command: z.string(),
        args: z.array(z.string()).optional(),
      })])).optional(),
      requireConfirmation: z.array(z.union([z.string(), z.object({
        command: z.string(),
        args: z.array(z.string()).optional(),
      })])).optional(),
      timeoutMs: z.number().int().positive().optional(),
      maxConcurrent: z.number().int().positive().optional(),
    })
    .optional(),
});

/**
 * Plugin setup specification schema
 */
export const setupSpecSchema = z
  .object({
    handler: z.string().min(1),
    describe: z.string().min(1),
    permissions: permissionSpecSchema,
  })
  .superRefine((value, ctx) => {
    const fs = value.permissions?.fs;
    if (!fs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'setup.permissions.fs must be specified to declare filesystem scope',
        path: ['permissions', 'fs'],
      });
      return;
    }

    if (fs.mode === 'none') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'setup.permissions.fs.mode cannot be "none"',
        path: ['permissions', 'fs', 'mode'],
      });
    }

    if (!fs.allow || fs.allow.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'setup.permissions.fs.allow must declare at least one allowed path pattern',
        path: ['permissions', 'fs', 'allow'],
      });
    }
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
  manifestVersion: z.literal('1.0').default('1.0'),
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
 * Header match & rule schemas
 */
const headerNameRegex = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export const headerMatchSchema: z.ZodType<HeaderMatch> = z.union([
  z.object({
    kind: z.literal('exact'),
    name: z
      .string()
      .min(1)
      .max(256)
      .refine((name) => headerNameRegex.test(name), {
        message: 'Header name must follow RFC 7230 token format',
      }),
  }),
  z.object({
    kind: z.literal('prefix'),
    prefix: z
      .string()
      .min(1)
      .max(128)
      .refine((prefix) => headerNameRegex.test(prefix.replace(/\*$/, ''))),
  }),
  z.object({
    kind: z.literal('regex'),
    pattern: z
      .string()
      .min(1)
      .max(128)
      .refine((pattern) => !pattern.includes('(?<'), {
        message: 'Look-behind assertions are not supported in header regex',
      }),
    flags: z
      .string()
      .regex(/^[imuy]*$/)
      .optional(),
  }),
]);

export const headerValidatorSchema: z.ZodType<NonNullable<HeaderRule['validators']>[number]> =
  z.union([
    z.object({
      kind: z.literal('regex'),
      pattern: z
        .string()
        .min(1)
        .max(256)
        .refine((pattern) => !pattern.includes('(?<'), {
          message: 'Look-behind assertions are not supported in validators',
        }),
      flags: z
        .string()
        .regex(/^[imuy]*$/)
        .optional(),
    }),
    z.object({
      kind: z.literal('enum'),
      values: z.array(z.string()).min(1),
    }),
    z.object({
      kind: z.literal('length'),
      min: z.number().int().nonnegative().max(1024).optional(),
      max: z.number().int().positive().max(8192).optional(),
    }).refine(
      (val) =>
        val.min === undefined ||
        val.max === undefined ||
        val.min <= val.max,
      {
        message: 'length.min must be <= length.max',
      }
    ),
  ]);

export const headerRuleSchema: z.ZodType<HeaderRule> = z
  .object({
    match: headerMatchSchema,
    direction: z.enum(['in', 'out', 'both']).optional(),
    action: z.enum(['forward', 'strip', 'map']),
    mapTo: z.string().min(1).max(256).optional(),
    sensitive: z.boolean().optional(),
    validators: z.array(headerValidatorSchema).max(8).optional(),
    required: z.boolean().optional(),
    redactInErrors: z.boolean().optional(),
    exposeToStudio: z.boolean().optional(),
    cacheVary: z.boolean().optional(),
    rateLimitKey: z.boolean().optional(),
    transform: z.string().min(1).optional(),
  })
  .refine(
    (rule) => {
      if (rule.action === 'map') {
        return typeof rule.mapTo === 'string' && rule.mapTo.length > 0;
      }
      return rule.mapTo === undefined;
    },
    {
      message: 'mapTo must be provided when action is "map"',
      path: ['mapTo'],
    }
  );

export const headerPolicySchema: z.ZodType<HeaderPolicy> = z.object({
  schema: z.literal('kb.headers/1').optional(),
  defaults: z.enum(['deny', 'allowSafe']).optional(),
  inbound: z.array(headerRuleSchema).max(64).optional(),
  outbound: z.array(headerRuleSchema).max(64).optional(),
  allowList: z.array(z.string().min(1)).optional(),
  denyList: z.array(z.string().min(1)).optional(),
  maxHeaders: z.number().int().positive().max(128).optional(),
  maxHeaderBytes: z.number().int().positive().max(65536).optional(),
  maxValueBytes: z.number().int().positive().max(32768).optional(),
});

export const securityHeadersSchema: z.ZodType<SecurityHeaders> = z.object({
  cors: z
    .object({
      allowOrigins: z.union([z.array(z.string().min(1)), z.literal('*')]).optional(),
      allowHeaders: z.array(z.string().min(1)).optional(),
      exposeHeaders: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  hsts: z
    .object({
      enabled: z.boolean(),
      maxAge: z.number().int().positive(),
      includeSubDomains: z.boolean().optional(),
    })
    .optional(),
  cookies: z
    .object({
      sameSite: z.enum(['Lax', 'Strict', 'None']).optional(),
      secure: z.boolean().optional(),
      httpOnly: z.boolean().optional(),
    })
    .optional(),
  csp: z.string().optional(),
  referrerPolicy: z.string().optional(),
});

const routeIdSchema: z.ZodType<NonNullable<HeadersConfig['routes']>[number]['routeId']> = z
  .string()
  .regex(/^(GET|POST|PUT|PATCH|DELETE) .+$/, {
    message: 'routeId must be in format "METHOD /path"',
  }) as z.ZodType<NonNullable<HeadersConfig['routes']>[number]['routeId']>

const headerRouteSchema: z.ZodType<NonNullable<HeadersConfig['routes']>[number]> = z
  .object({
    routeId: routeIdSchema,
    policy: headerPolicySchema,
  }) as z.ZodType<NonNullable<HeadersConfig['routes']>[number]>

export const headersConfigSchema: z.ZodType<HeadersConfig> = z.object({
  version: z.literal(1).optional(),
  profile: z.string().optional(),
  defaults: headerPolicySchema.optional(),
  routes: z
    .array(headerRouteSchema)
    .max(128)
    .optional(),
  security: securityHeadersSchema.optional(),
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
 * Job declaration schema
 */
export const jobDeclSchema: z.ZodType<JobDecl> = z.object({
  id: z.string().min(1),
  handler: z.string().regex(/^\.\/.*#\w+$/, 'Handler must be in format ./path/to/file.js#exportName'),
  schedule: z.string().min(1), // Validated at runtime by cron-parser
  describe: z.string().optional(),
  input: z.unknown().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(10).default(5),
  timeout: z.number().int().positive().default(1200000),
  retries: z.number().int().min(0).max(5).default(2),
  tags: z.array(z.string()).optional(),
  startAt: z.number().int().positive().optional(),
  endAt: z.number().int().positive().optional(),
  maxRuns: z.number().int().positive().optional(),
  permissions: permissionSpecSchema.optional(),
});

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
  setup: setupSpecSchema.optional(),
  cli: z
    .object({
      commands: z.array(cliCommandDeclSchema).min(1),
    })
    .optional(),
  headers: headersConfigSchema.optional(),
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
  jobs: z.array(jobDeclSchema).optional(),
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
