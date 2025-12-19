/**
 * Plugin Manifest V3
 *
 * Declarative metadata for V3 plugin system.
 * Combines the best of V2 (declarative) with V3 architecture (sandboxed, type-safe).
 */

import type { PermissionSpec } from './permissions.js';
import type { HostType } from './host-context.js';

/**
 * Schema reference for input/output validation
 */
export type SchemaRef =
  | { $ref: string } // OpenAPI JSON Schema reference
  | { zod: string }; // Zod schema reference: './path/to/schema.ts#exportedSchema'

/**
 * Display metadata for plugin
 */
export interface DisplayMetadata {
  /** Plugin name (human-readable) */
  name: string;
  /** Plugin description */
  description?: string;
  /** Plugin author */
  author?: string;
  /** Plugin homepage URL */
  homepage?: string;
  /** Plugin repository URL */
  repository?: string;
  /** Tags for categorization */
  tags?: string[];
  /** Plugin icon (URL or emoji) */
  icon?: string;
}

/**
 * Plugin dependency declaration
 */
export interface PluginDependency {
  /** Plugin ID (@scope/name) */
  id: string;
  /** Semver range (e.g., '^1.0.0', '>=2.0.0') */
  version: string;
  /** Optional dependency (plugin still loads if missing) */
  optional?: boolean;
}

/**
 * Platform service requirements
 */
export interface PlatformRequirements {
  /** Required services (plugin fails to load if missing) */
  requires?: Array<
    | 'vectorStore'
    | 'llm'
    | 'embeddings'
    | 'cache'
    | 'storage'
    | 'logger'
    | 'analytics'
  >;
  /** Optional services (features degraded if missing) */
  optional?: Array<string>;
}

/**
 * CLI command flag definition
 */
export interface CliFlagDecl {
  /** Flag name (e.g., 'verbose') */
  name: string;
  /** Flag type */
  type: 'string' | 'boolean' | 'number' | 'array';
  /** Short alias (e.g., 'v' for '--verbose') */
  alias?: string;
  /** Default value */
  default?: unknown;
  /** Description */
  description?: string;
  /** Allowed values (enum) */
  choices?: string[];
  /** Required flag */
  required?: boolean;
}

/**
 * CLI command declaration
 */
export interface CliCommandDecl {
  /** Unique command identifier (e.g., 'hello', 'ai-review:review') */
  id: string;
  /** Command group (e.g., 'ai-review') */
  group?: string;
  /** Short description */
  describe: string;
  /** Long description (for --help) */
  longDescription?: string;
  /** Command flags */
  flags?: CliFlagDecl[];
  /** Usage examples */
  examples?: string[];
  /** Handler file path relative to plugin root (e.g., './dist/commands/hello.js') */
  handler: string;
  /** Command-specific permissions (overrides plugin defaults) */
  permissions?: PermissionSpec;
}

/**
 * REST route error specification
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
  /** Route path (relative to basePath, e.g., '/search') */
  path: string;
  /** Human-readable description for OpenAPI docs */
  description?: string;
  /** Route-specific timeout in milliseconds */
  timeoutMs?: number;
  /** Input schema (body for POST/PUT/PATCH, query for GET) */
  input?: SchemaRef;
  /** Output schema */
  output?: SchemaRef;
  /** Declared error responses */
  errors?: ErrorSpec[];
  /** Handler file path relative to plugin root (e.g., './dist/rest/search.js') */
  handler: string;
  /** Security requirements */
  security?: ('none' | 'user' | 'token' | 'oauth')[];
  /** Route-specific permissions (overrides plugin defaults) */
  permissions?: PermissionSpec;
}

/**
 * REST API configuration
 */
export interface RestConfig {
  /** Base path for all routes (e.g., '/v1/plugins/mind') */
  basePath?: `/v1/plugins/${string}`;
  /** Default route behaviour */
  defaults?: {
    /** Default timeout for routes (milliseconds) */
    timeoutMs?: number;
  };
  /** Route declarations */
  routes: RestRouteDecl[];
}

/**
 * Workflow handler declaration
 */
export interface WorkflowHandlerDecl {
  /** Unique workflow identifier (e.g., 'sync-dependencies') */
  id: string;
  /** Human-readable description */
  describe?: string;
  /** Handler file path relative to plugin root (e.g., './dist/workflows/sync.js') */
  handler: string;
  /** Input schema */
  input?: SchemaRef;
  /** Output schema */
  output?: SchemaRef;
  /** Handler-specific permissions */
  permissions?: PermissionSpec;
}

/**
 * Webhook handler declaration
 */
export interface WebhookHandlerDecl {
  /** Event pattern (e.g., 'github:push', 'slack:message') */
  event: string;
  /** Human-readable description */
  describe?: string;
  /** Handler file path relative to plugin root (e.g., './dist/webhooks/github.js') */
  handler: string;
  /** Input schema (webhook payload) */
  input?: SchemaRef;
  /** Handler-specific permissions */
  permissions?: PermissionSpec;
}

/**
 * Job declaration for scheduled/background tasks
 */
export interface JobDecl {
  /** Unique job identifier (e.g., 'auto-index') */
  id: string;
  /** Handler file path relative to plugin root (e.g., './dist/jobs/auto-index.js') */
  handler: string;
  /** Cron schedule or interval ('0 * * * *', '5m', '1h') */
  schedule?: string;
  /** Human-readable description */
  describe?: string;
  /** Input data passed to handler */
  input?: unknown;
  /** Whether job is enabled by default */
  enabled?: boolean;
  /** Job priority (1-10, default: 5) */
  priority?: number;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Retry attempts on failure */
  retries?: number;
  /** Job tags */
  tags?: string[];
  /** Job-specific permissions */
  permissions?: PermissionSpec;
}

/**
 * Data source for Studio widget data
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
 * Studio widget action handler configuration
 */
export interface ActionHandler {
  type: 'rest' | 'navigate' | 'callback' | 'event' | 'modal';
  config: Record<string, unknown>;
}

/**
 * Studio widget action definition
 */
export interface WidgetAction {
  id: string;
  label: string;
  type?: 'button' | 'modal' | 'link' | 'dropdown';
  icon?: string;
  variant?: 'primary' | 'default' | 'danger';
  handler?: ActionHandler;
  confirm?: {
    title: string;
    description: string;
  };
  disabled?: boolean | string;
  visible?: boolean | string;
  order?: number;
}

/**
 * Lifecycle hook specification
 */
export interface LifecycleHooks {
  /** Handler executed when plugin loads (initialization) */
  onLoad?: string;
  /** Handler executed when plugin unloads (cleanup) */
  onUnload?: string;
  /** Handler executed when plugin is enabled */
  onEnable?: string;
  /** Handler executed when plugin is disabled */
  onDisable?: string;
}

/**
 * Studio widget declaration
 */
export interface StudioWidgetDecl<O = Record<string, unknown>> {
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
  /** UI options (typed downstream per widget kind) */
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
  actions?: WidgetAction[];
  /** Event bus configuration */
  events?: {
    /** Events this widget can emit */
    emit?: string[];
    /** Events this widget subscribes to */
    subscribe?: string[];
  };
  /** Polling interval in milliseconds (0 = no polling) */
  pollingMs?: number;
  /** Custom component reference (optional for standard widgets) */
  component?: string;
  /** Condition for widget visibility (JSONLogic expression) */
  condition?: string;
  /** Render order (lower = earlier) */
  order?: number;
}

/**
 * Studio menu item declaration
 */
export interface StudioMenuDecl {
  /** Menu identifier */
  id: string;
  /** Menu label */
  label: string;
  /** Target widget or route */
  target: string;
  /** Icon (optional) */
  icon?: string;
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
  /** Layout-specific configuration */
  config?: Record<string, unknown>;
  /** Explicit list of widget IDs to render in this layout */
  widgets?: string[];
  /** Layout actions (page-level actions) */
  actions?: WidgetAction[];
}

/**
 * Studio configuration
 */
export interface StudioConfig {
  /** Widget declarations */
  widgets: StudioWidgetDecl[];
  /** Menu items */
  menus?: StudioMenuDecl[];
  /** Layout declarations */
  layouts?: StudioLayoutDecl[];
}

/**
 * Setup command specification
 */
export interface SetupSpec {
  /** Handler file path for setup (e.g., './dist/setup.js') */
  handler: string;
  /** Human-readable description */
  describe: string;
  /** Setup-specific permissions (usually broader than runtime) */
  permissions: PermissionSpec;
}

/**
 * Plugin Manifest V3
 *
 * Declarative metadata for plugin capabilities, handlers, and requirements.
 *
 * @example kb.plugin.json
 * ```json
 * {
 *   "schema": "kb.plugin/3",
 *   "id": "@kb-labs/my-plugin",
 *   "version": "1.0.0",
 *   "display": {
 *     "name": "My Plugin",
 *     "description": "Does cool things"
 *   },
 *   "permissions": {
 *     "fs": { "mode": "read", "allow": [".kb/**"] },
 *     "net": { "allowHosts": ["api.example.com"] }
 *   },
 *   "cli": {
 *     "commands": [{
 *       "id": "hello",
 *       "describe": "Say hello",
 *       "handler": "./dist/commands/hello.js",
 *       "flags": []
 *     }]
 *   }
 * }
 * ```
 */
export interface ManifestV3 {
  /** Schema version */
  schema: 'kb.plugin/3';

  /** Plugin identifier (@scope/name) */
  id: string;

  /** Plugin version (semver) */
  version: string;

  /**
   * Config section identifier in kb.config.json
   * Used by runtime to load plugin-specific config
   * @example 'mind' maps to kb.config.json → profiles[].products.mind
   */
  configSection?: string;

  /** Display metadata */
  display?: DisplayMetadata;

  /** Plugin-wide permission defaults */
  permissions?: PermissionSpec;

  /** Plugin dependencies */
  dependencies?: PluginDependency[];

  /** Platform service requirements */
  platform?: PlatformRequirements;

  /** Setup command (runs during installation/initialization) */
  setup?: SetupSpec;

  /** Lifecycle hooks (onLoad, onUnload, onEnable, onDisable) */
  lifecycle?: LifecycleHooks;

  /** CLI commands */
  cli?: {
    commands: CliCommandDecl[];
  };

  /** REST API routes */
  rest?: RestConfig;

  /** Workflow handlers */
  workflows?: {
    handlers: WorkflowHandlerDecl[];
  };

  /** Webhook handlers */
  webhooks?: {
    handlers: WebhookHandlerDecl[];
  };

  /** Scheduled/background jobs */
  jobs?: JobDecl[];

  /** Studio widgets, menus, and layouts */
  studio?: StudioConfig;
}

/**
 * Type guard to check if manifest is V3
 */
export function isManifestV3(manifest: unknown): manifest is ManifestV3 {
  return (
    typeof manifest === 'object' &&
    manifest !== null &&
    'schema' in manifest &&
    manifest.schema === 'kb.plugin/3'
  );
}

/**
 * Get handler path for specific command/route/workflow
 */
export function getHandlerPath(
  manifest: ManifestV3,
  host: HostType,
  id: string
): string | undefined {
  switch (host) {
    case 'cli':
      return manifest.cli?.commands.find((cmd) => cmd.id === id)?.handler;
    case 'rest':
      return manifest.rest?.routes.find(
        (route) => `${route.method} ${route.path}` === id
      )?.handler;
    case 'workflow':
      return manifest.workflows?.handlers.find((h) => h.id === id)?.handler;
    case 'webhook':
      return manifest.webhooks?.handlers.find((h) => h.event === id)?.handler;
    default:
      return undefined;
  }
}

/**
 * Get permissions for specific handler
 */
export function getHandlerPermissions(
  manifest: ManifestV3,
  host: HostType,
  id: string
): PermissionSpec {
  // Get handler-specific permissions
  let handlerPerms: PermissionSpec | undefined;

  switch (host) {
    case 'cli':
      handlerPerms = manifest.cli?.commands.find((cmd) => cmd.id === id)
        ?.permissions;
      break;
    case 'rest':
      handlerPerms = manifest.rest?.routes.find(
        (route) => `${route.method} ${route.path}` === id
      )?.permissions;
      break;
    case 'workflow':
      handlerPerms = manifest.workflows?.handlers.find((h) => h.id === id)
        ?.permissions;
      break;
    case 'webhook':
      handlerPerms = manifest.webhooks?.handlers.find((h) => h.event === id)
        ?.permissions;
      break;
  }

  // Merge with plugin-wide defaults
  return {
    ...manifest.permissions,
    ...handlerPerms,
  };
}
