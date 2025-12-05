/**
 * @module @kb-labs/plugin-manifest/types
 * Manifest v2 type definitions
 */

import type { Handler, PluginContext } from './runtime';

/**
 * Schema reference - only two formats allowed:
 * 1. OpenAPI JSON Schema reference: { $ref: '#/components/schemas/X' }
 * 2. Zod schema reference: { zod: './path/to/schema.ts#exportedSchema' }
 */
export type SchemaRef =
  | { $ref: string }
  | { zod: string };

/**
 * Invoke permission specification for cross-plugin calls
 */
export interface InvokePermission {
  /** Allow list of plugin IDs that can be invoked */
  plugins?: string[];
  /** Allow list of specific routes (format: @pluginId:METHOD /path) */
  routes?: Array<{ target: `${string}:${'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} ${string}` }>;
  /** Deny list of routes (overrides allow) */
  deny?: Array<{ target: `${string}:${string}` }>;
}

/**
 * Artifact access control specification
 */
export interface ArtifactAccess {
  /** Read permissions for artifacts */
  read?: Array<{ 
    from: 'self' | string; 
    paths: string[]; 
    allowedTypes?: string[];
  }>;
  /** Write permissions for artifacts */
  write?: Array<{ 
    to: 'self' | string; 
    paths: string[];
  }>;
}

/**
 * Shell command specification for permissions
 */
export type ShellCommandPattern = string | { command: string; args?: string[] };

/**
 * Shell execution permissions
 */
export interface ShellPermission {
  /** Allow list of commands and patterns (e.g., 'tsc', 'pnpm exec *', { command: 'git', args: ['status'] }) */
  allow: Array<ShellCommandPattern>;
  /** Deny list of commands (overrides allow, highest priority) */
  deny?: Array<ShellCommandPattern>;
  /** Commands that require user confirmation */
  requireConfirmation?: Array<ShellCommandPattern>;
  /** Default timeout in milliseconds */
  timeoutMs?: number;
  /** Maximum concurrent shell processes */
  maxConcurrent?: number;
}

/**
 * Job submission permissions
 */
export interface JobSubmitPermission {
  /** Allow list of handler paths (e.g., ['handlers/*'], ['handlers/sync-*']) */
  allow?: string[];
  /** Maximum concurrent jobs */
  maxConcurrent?: number;
  /** Maximum duration per job in milliseconds */
  maxDuration?: number;
  /** Quotas for job submission */
  quotas?: {
    /** Maximum jobs per minute */
    perMinute?: number;
    /** Maximum jobs per hour */
    perHour?: number;
    /** Maximum jobs per day */
    perDay?: number;
  };
}

/**
 * Job scheduling permissions
 */
export interface JobSchedulePermission {
  /** Allow list of handler paths (e.g., ['handlers/*'], ['handlers/sync-*']) */
  allow?: string[];
  /** Maximum active schedules */
  maxSchedules?: number;
  /** Minimum interval between runs in milliseconds */
  minInterval?: number;
  /** Quotas for schedule creation */
  quotas?: {
    /** Maximum schedules per hour */
    perHour?: number;
    /** Maximum schedules per day */
    perDay?: number;
  };
}

/**
 * Job and cron permissions
 */
export interface JobPermission {
  /** Permissions for one-time background jobs */
  submit?: JobSubmitPermission;
  /** Permissions for recurring scheduled jobs */
  schedule?: JobSchedulePermission;
}

/**
 * State broker namespace access specification
 */
export interface StateNamespaceAccess {
  /** Namespace identifier (e.g., 'mind', 'workflow', 'analytics') */
  namespace: string;
  /** Read permission */
  read?: boolean;
  /** Write permission */
  write?: boolean;
  /** Delete permission */
  delete?: boolean;
  /** Human-readable reason (REQUIRED for write/delete on external namespaces) */
  reason?: string;
}

/**
 * State broker permissions
 */
export interface StatePermission {
  /** Access to own namespace (default: all permissions granted) */
  own?: {
    read?: boolean;
    write?: boolean;
    delete?: boolean;
  };
  /** Access to external namespaces (explicit declaration required) */
  external?: StateNamespaceAccess[];
  /** Quotas for state operations */
  quotas?: {
    /** Maximum entries this plugin can create */
    maxEntries?: number;
    /** Maximum total size in bytes */
    maxSizeBytes?: number;
    /** Maximum operations per minute */
    operationsPerMinute?: number;
  };
}

/**
 * Permission specification with strict unions and allow/deny lists
 */
export interface PermissionSpec {
  fs?: {
    mode: 'none' | 'read' | 'readWrite';
    allow?: string[];
    deny?: string[];
  };
  net?:
    | {
        allowHosts?: string[];
        denyHosts?: string[];
        allowCidrs?: string[];
        timeoutMs?: number;
      }
    | 'none';
  env?: {
    allow?: string[];
  };
  quotas?: {
    timeoutMs?: number;
    memoryMb?: number;
    cpuMs?: number;
  };
  capabilities?: string[];
  /** Cross-plugin invocation permissions */
  invoke?: InvokePermission;
  /** Artifact access permissions */
  artifacts?: ArtifactAccess;
  /** Shell execution permissions */
  shell?: ShellPermission;
  /** Job and cron permissions */
  jobs?: JobPermission;
  /** Event bus permissions */
  events?: {
    /** Allowed topics/prefixes for emit */
    produce?: string[];
    /** Allowed topics/prefixes for subscriptions */
    consume?: string[];
    /** Allowed scopes */
    scopes?: Array<'local' | 'plugin' | 'system'>;
    /** Optional schema references per topic */
    schemas?: Record<string, SchemaRef>;
    /** Maximum payload size per event (bytes) */
    maxPayloadBytes?: number;
    /** Maximum listeners per topic */
    maxListenersPerTopic?: number;
    /** Maximum queued events per scope */
    maxQueueSize?: number;
    /** Drop policy when queue saturated */
    dropPolicy?: 'drop-oldest' | 'drop-new';
    /** Quota: events per minute */
    eventsPerMinute?: number;
    /** Quota: concurrent handler executions */
    concurrentHandlers?: number;
    /** Duplicate cache size */
    duplicateCacheSize?: number;
    /** Duplicate entry TTL (ms) */
    duplicateTtlMs?: number;
    /** Default timeout for waitFor (ms) */
    defaultWaitTimeoutMs?: number;
    /** Shutdown drain timeout (ms) */
    shutdownTimeoutMs?: number;
    /** Keys to redact in logs */
    redactKeys?: string[];
  };
  /** State broker permissions */
  state?: StatePermission;
}

/**
 * Artifact capabilities
 */
export type ArtifactCapability = 'stream' | 'watch' | 'multipart';

/**
 * Artifact declaration
 */
export interface ArtifactDecl {
  /** Unique artifact identifier */
  id: string;
  /** Human-readable description */
  description?: string;
  /** Path template with placeholders: {profile}, {runId}, {ts} */
  pathTemplate: string;
  /** Optional schema reference for validation */
  schemaRef?: SchemaRef;
  /** Version of the artifact (e.g., "1.0.0") */
  version?: string;
  /** Version of the schema */
  schemaVersion?: string;
  /** Default TTL in seconds */
  ttl?: number;
  /** Supported capabilities */
  capabilities?: ArtifactCapability[];
}

/**
 * CLI command flag definition
 */
export interface CliFlagDecl {
  name: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  alias?: string;
  default?: unknown;
  description?: string;
  choices?: string[];
  required?: boolean;
}

/**
 * CLI command declaration
 */
export interface CliCommandDecl {
  /** CLI manifest schema version (defaults to '1.0') */
  manifestVersion?: '1.0';
  /** Unique command identifier (e.g., 'ai-review:review') */
  id: string;
  /** Command group (e.g., 'ai-review') */
  group?: string;
  /** Short description */
  describe: string;
  /** Long description */
  longDescription?: string;
  /** Command flags */
  flags: CliFlagDecl[];
  /** Usage examples */
  examples?: string[];
  /** Handler reference: './path/to/file.js#exportName' */
  handler: string;
}

/**
 * Error specification for REST routes
 */
export interface ErrorSpec {
  /** Error code (e.g., 'CONFIG_NOT_RESOLVED') */
  code: string;
  /** HTTP status code (400-599) */
  http: number;
  /** Human-readable description */
  description?: string;
}

/**
 * REST route declaration
 */
export interface RestRouteDecl {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Route path (must be within basePath) */
  path: string;
  /** Route-specific timeout in milliseconds */
  timeoutMs?: number;
  /** Input schema (body for POST/PUT/PATCH, query for GET) */
  input?: SchemaRef;
  /** Output schema */
  output: SchemaRef;
  /** Declared error responses */
  errors?: ErrorSpec[];
  /** Handler reference: './path/to/file.js#exportName' */
  handler: string;
  /** Security requirements: none, user, token, oauth */
  security?: ('none' | 'user' | 'token' | 'oauth')[];
  /** Permissions specific to this route */
  permissions?: PermissionSpec;
}

/**
 * Header matching rule
 */
export type HeaderMatch =
  | { kind: 'exact'; name: string }
  | { kind: 'prefix'; prefix: string }
  | { kind: 'regex'; pattern: string; flags?: string };

export type HeaderValidator =
  | { kind: 'regex'; pattern: string; flags?: string }
  | { kind: 'enum'; values: string[] }
  | { kind: 'length'; min?: number; max?: number };

export interface HeaderRule {
  match: HeaderMatch;
  direction?: 'in' | 'out' | 'both';
  action: 'forward' | 'strip' | 'map';
  mapTo?: string;
  sensitive?: boolean;
  validators?: HeaderValidator[];
  required?: boolean;
  redactInErrors?: boolean;
  exposeToStudio?: boolean;
  cacheVary?: boolean;
  rateLimitKey?: boolean;
  transform?: string;
}

export interface HeaderPolicy {
  schema?: 'kb.headers/1';
  defaults?: 'deny' | 'allowSafe';
  inbound?: HeaderRule[];
  outbound?: HeaderRule[];
  allowList?: string[];
  denyList?: string[];
  maxHeaders?: number;
  maxHeaderBytes?: number;
  maxValueBytes?: number;
}

export interface SecurityHeaders {
  cors?: {
    allowOrigins?: string[] | '*';
    allowHeaders?: string[];
    exposeHeaders?: string[];
  };
  hsts?: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains?: boolean;
  };
  cookies?: {
    sameSite?: 'Lax' | 'Strict' | 'None';
    secure?: boolean;
    httpOnly?: boolean;
  };
  csp?: string;
  referrerPolicy?: string;
}

export interface HeadersConfig {
  version?: 1;
  defaults?: HeaderPolicy;
  routes?: Array<{
    routeId: `${Uppercase<string>} ${string}`;
    policy: HeaderPolicy;
  }>;
  security?: SecurityHeaders;
  profile?: string;
}

/**
 * Data source for widget data
 */
export type DataSource =
  | {
      type: 'rest';
      routeId: string;
      method?: 'GET' | 'POST';
      headers?: Record<string, string>;
    }
  | {
      type: 'mock';
      fixtureId: string;
    };

/**
 * Studio widget declaration with generic options
 */
export type StudioWidgetDecl<O = Record<string, unknown>> = {
  /** Unique widget identifier (e.g., 'ai-review/report') */
  id: string;
  /** Widget kind */
  kind:
    | 'panel'
    | 'card'
    | 'cardlist'
    | 'table'
    | 'chart'
    | 'tree'
    | 'timeline'
    | 'metric'
    | 'logs'
    | 'json'
    | 'diff'
    | 'status'
    | 'progress'
    | 'infopanel'
    | 'keyvalue'
    | 'form'
    | 'input-display';
  /** Widget title */
  title: string;
  /** Widget description */
  description?: string;
  /** Data configuration */
  data: {
    source: DataSource;
    schema?: SchemaRef;
  };
  /** UI options (typed downstream) */
  options?: O;
  /** Layout hint for grid layouts */
  layoutHint?: {
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    /** Height control: 'auto' (fit content), number (fixed px), 'fit-content' (minimal) */
    height?: 'auto' | number | 'fit-content';
  };
  /** Widget actions (buttons, modals, etc.) */
  actions?: Array<{
    id: string;
    label: string;
    type?: 'button' | 'modal' | 'link' | 'dropdown';
    icon?: string;
    variant?: 'primary' | 'default' | 'danger';
    handler?: {
      type: 'rest' | 'navigate' | 'callback' | 'event' | 'modal';
      config: Record<string, unknown>;
    };
    confirm?: {
      title: string;
      description: string;
    };
    disabled?: boolean | string;
    visible?: boolean | string;
    order?: number;
  }>;
  /** Event bus configuration */
  events?: {
    /** Events this widget can emit */
    emit?: string[];
    /** Events this widget subscribes to */
    subscribe?: string[];
  };
  /** Polling interval in milliseconds (0 = no polling) */
  pollingMs?: number;
  /** Component reference: './path/to/Component.tsx#Widget' (optional for standard widgets) */
  component?: string;
  /** Condition for widget visibility (JSONLogic-like: "and(eq($ctx.profile,'frontend'), gt($metrics.openFindings,0))") */
  condition?: string;
  /** Render order (lower = earlier) */
  order?: number;
};

/**
 * Studio menu declaration
 */
export interface StudioMenuDecl {
  /** Menu identifier */
  id: string;
  /** Menu label */
  label: string;
  /** Target widget or route */
  target: string;
  /** Render order (lower = earlier) */
  order?: number;
}

/**
 * Studio layout declaration
 */
export interface StudioLayoutDecl {
  /** Layout identifier */
  id: string;
  /** Layout kind */
  kind: 'grid' | 'two-pane';
  /** Layout title */
  title: string;
  /** Layout description */
  description?: string;
  /** Layout name (for backwards compatibility) */
  name?: string;
  /** Available layout template (for backwards compatibility) */
  template?: string;
  /** Layout-specific configuration */
  config?: Record<string, unknown>;
  // For grid: required keys: cols (object with sm, md, lg), rowHeight (number)
  /** Explicit list of widget IDs to render in this layout */
  widgets?: string[];
  /** Layout actions (page-level actions) */
  actions?: Array<{
    id: string;
    label: string;
    type?: 'button' | 'modal' | 'link' | 'dropdown';
    icon?: string;
    variant?: 'primary' | 'default' | 'danger';
    handler?: {
      type: 'rest' | 'navigate' | 'callback' | 'event' | 'modal';
      config: Record<string, unknown>;
    };
    confirm?: {
      title: string;
      description: string;
    };
    disabled?: boolean | string;
    visible?: boolean | string;
    order?: number;
  }>;
}

/**
 * Display metadata
 */
export interface DisplayMetadata {
  /** Plugin name */
  name: string;
  /** Plugin description */
  description?: string;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Manifest v2 - single source of truth for CLI, REST, Studio
 */
/**
 * Plugin dependency
 */
export interface PluginDependency {
  /** Plugin ID */
  id: string;
  /** Semver range */
  version: string;
  /** Optional dependency */
  optional?: boolean;
}

/**
 * Plugin lifecycle hooks
 */
export interface LifecycleHooks {
  /** Called when plugin is loaded */
  onLoad?: string; // e.g., './lifecycle.js#onLoad'
  /** Called when plugin is unloaded */
  onUnload?: string;
  /** Called when plugin is enabled */
  onEnable?: string;
  /** Called when plugin is disabled */
  onDisable?: string;
}

/**
 * Platform service identifier.
 * Maps to PlatformServices keys in @kb-labs/core-platform.
 */
export type PlatformServiceId =
  // Adapter services (replaceable via kb.config.json)
  | 'vectorStore'
  | 'llm'
  | 'embeddings'
  | 'cache'
  | 'storage'
  | 'logger'
  | 'analytics'
  | 'events'
  | 'invoke'
  | 'artifacts'
  // Core features (built-in)
  | 'workflows'
  | 'jobScheduler'
  | 'cron'
  | 'resources';

/**
 * Platform requirements specification.
 * Declares which platform services the plugin needs.
 *
 * @example
 * ```json
 * {
 *   "platform": {
 *     "requires": ["embeddings", "vectorStore"],
 *     "optional": ["llm"]
 *   }
 * }
 * ```
 */
export interface PlatformRequirements {
  /**
   * Required platform services.
   * Plugin will fail to load if any of these are not configured.
   */
  requires?: PlatformServiceId[];

  /**
   * Optional platform services.
   * Plugin will load but features may be degraded if not available.
   */
  optional?: PlatformServiceId[];
}

/**
 * Plugin setup specification
 */
export interface SetupSpec {
  /** Handler reference invoked during setup (e.g., './setup.js#run') */
  handler: string;
  /** Human-readable description of what setup does */
  describe: string;
  /**
   * Permissions granted to the setup handler. Must explicitly declare filesystem
   * access (allow/deny patterns, mode) and any other resources it needs.
   */
  permissions: PermissionSpec;
}

/**
 * Job declaration for recurring scheduled tasks
 */
export interface JobDecl {
  /** Unique job identifier within plugin (e.g., 'auto-index') */
  id: string;

  /** Handler reference: './handlers/auto-index.js#run' */
  handler: string;

  /** Cron schedule expression or interval string
   * - Cron: "0 * * * *" (hourly), "0 0 * * *" (daily)
   * - Interval: "5m", "1h", "30s"
   */
  schedule: string;

  /** Human-readable description */
  describe?: string;

  /** Input data passed to handler */
  input?: unknown;

  /** Whether job is enabled (default: true) */
  enabled?: boolean;

  /** Job priority (1-10, default: 5, higher = more important) */
  priority?: number;

  /** Execution timeout in milliseconds (default: 1200000 = 20min) */
  timeout?: number;

  /** Number of retry attempts on failure (default: 2) */
  retries?: number;

  /** Tags for filtering and organization */
  tags?: string[];

  /** Start timestamp (when to begin scheduling, optional) */
  startAt?: number;

  /** End timestamp (when to stop scheduling, optional) */
  endAt?: number;

  /** Maximum number of executions (optional) */
  maxRuns?: number;

  /** Permissions specific to this job (inherits from plugin if not specified) */
  permissions?: PermissionSpec;
}

export interface ManifestV2 {
  /** Schema version */
  schema: 'kb.plugin/2';
  /** Plugin identifier */
  id: string;
  /** Plugin version (semver) */
  version: string;
  /** Display metadata */
  display?: DisplayMetadata;
  /** Required capabilities (e.g., ['kv.read', 'blob.write']) */
  capabilities?: string[];
  /** Permission requirements */
  permissions?: PermissionSpec;
  /** Artifact declarations */
  artifacts?: ArtifactDecl[];
  /** Plugin dependencies */
  dependencies?: PluginDependency[];
  /** Lifecycle hooks */
  lifecycle?: LifecycleHooks;
  /**
   * Platform service requirements.
   * Declares which platform services (vectorStore, llm, workflows, etc.)
   * this plugin needs to function.
   *
   * Required services are validated at plugin load time.
   * If any required service is not configured, the plugin fails to load
   * with a clear error message.
   *
   * @example
   * ```json
   * {
   *   "platform": {
   *     "requires": ["embeddings", "vectorStore"],
   *     "optional": ["llm"]
   *   }
   * }
   * ```
   */
  platform?: PlatformRequirements;
  /** Setup command declaration for workspace initialization */
  setup?: SetupSpec;
  /** CLI commands */
  cli?: {
    commands: CliCommandDecl[];
  };
  /** REST API routes */
  rest?: {
    /** Base path for all routes (e.g., '/v1/plugins/ai-review') */
    basePath?: `/v1/plugins/${string}`;
    /** Default route behaviour */
    defaults?: {
      /** Default timeout for plugin routes (milliseconds) */
      timeoutMs?: number;
    };
    routes: RestRouteDecl[];
  };
  /** Header policies (plugin defaults + per-route overrides) */
  headers?: HeadersConfig;
  /** Studio widgets */
  studio?: {
    widgets: StudioWidgetDecl[];
    menus?: StudioMenuDecl[];
    layouts?: StudioLayoutDecl[];
  };
  /** Scheduled jobs */
  jobs?: JobDecl[];
}

/**
 * Manifest v1 (legacy format)
 * Based on cli.manifest.ts structure
 */
export interface ManifestV1 {
  manifestVersion: '1.0';
  commands: Array<{
    manifestVersion: '1.0';
    id: string;
    aliases?: string[];
    group: string;
    describe: string;
    longDescription?: string;
    requires?: string[];
    flags?: CliFlagDecl[];
    examples?: string[];
    loader: () => Promise<{ run: any }>;
  }>;
}
