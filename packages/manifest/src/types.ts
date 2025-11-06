/**
 * @module @kb-labs/plugin-manifest/types
 * Manifest v2 type definitions
 */

import type { Handler, PluginContext } from './runtime.js';

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
    | 'table'
    | 'chart'
    | 'tree'
    | 'timeline'
    | 'metric'
    | 'logs'
    | 'json'
    | 'diff'
    | 'status'
    | 'progress';
  /** Widget title */
  title: string;
  /** Widget description */
  description?: string;
  /** Data configuration */
  data: {
    source: DataSource;
    schema: SchemaRef;
  };
  /** UI options (typed downstream) */
  options?: O;
  /** Layout hint for grid layouts */
  layoutHint?: {
    w: number;
    h: number;
    minW?: number;
    minH?: number;
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
  /** CLI commands */
  cli?: {
    commands: CliCommandDecl[];
  };
  /** REST API routes */
  rest?: {
    /** Base path for all routes (e.g., '/v1/plugins/ai-review') */
    basePath?: `/v1/plugins/${string}`;
    routes: RestRouteDecl[];
  };
  /** Studio widgets */
  studio?: {
    widgets: StudioWidgetDecl[];
    menus?: StudioMenuDecl[];
    layouts?: StudioLayoutDecl[];
  };
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
