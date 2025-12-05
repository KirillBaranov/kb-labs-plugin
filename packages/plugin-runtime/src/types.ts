/**
 * @module @kb-labs/plugin-runtime/types
 * Execution types for plugin runtime
 */

import type { ManifestV2, PermissionSpec } from '@kb-labs/plugin-manifest';
import type { PluginContext } from './context/plugin-context';
import type {
  EventBus,
  EventBusConfig,
  EventEnvelope,
  EventScope,
} from './events/index';
import type { OperationTracker } from './operations/operation-tracker';
import type { TelemetryEvent, TelemetryEmitResult } from '@kb-labs/core-types';

/**
 * Handler reference - points to a specific handler function
 */
export type HandlerRef = {
  /** Relative path to handler file (e.g., './rest/review.js') */
  file: string;
  /** Export name (e.g., 'handle', 'run') */
  export: string;
};

import type { ChainLimits, InvokeContext } from './invoke/types';

/**
 * Log stream callback for real-time log output
 */
export type LogStreamCallback = (line: string, level: 'info' | 'warn' | 'error' | 'debug') => void;

/**
 * Runtime extensions for cross-plugin capabilities
 * 
 * @deprecated Use `runtime` API instead (e.g., `ctx.runtime.invoke()` instead of `ctx.extensions.invoke.invoke()`)
 * This will be removed in a future version. Migrate to runtime API for better type safety and consistency.
 */
export interface RuntimeExtensions {
  /** Artifact broker for reading/writing artifacts */
  artifacts?: import('./artifacts/broker').ArtifactBroker;
  /** Invoke broker for cross-plugin invocation */
  invoke?: import('./invoke/broker').InvokeBroker;
  /** Shell broker for command execution */
  shell?: import('./shell/broker').ShellBroker;
  /** Job broker for background and scheduled jobs */
  jobs?: import('./jobs/broker').JobBroker;
  /** State broker for persistent cross-invocation state management */
  state?: import('./io/state').StateRuntimeAPI;
  /** Event bus services */
  events?: {
    /** Local scope bus (per execution chain) */
    local: EventBus;
    /** Optional plugin-wide bus (shared singleton) */
    plugin?: EventBus;
    /** Effective configuration applied to the bus */
    config: EventBusConfig;
    /** Accessor for the raw envelope builder (useful for system topics) */
    createEnvelope?: (topic: string, payload: unknown, scope: EventScope) => EventEnvelope;
  };
}

/**
 * Plugin output API - unified logging and presentation
 * Combines logger and presenter for consistent output across CLI and REST handlers
 *
 * @example
 * ```typescript
 * ctx.output.info('Processing user data');
 * ctx.output.json({ result: data });
 * ctx.output.progress({ current: 5, total: 10, message: 'Processing...' });
 * ```
 */
export interface PluginOutput {
  /** Debug level logging (only shown in debug mode) */
  debug(message: string, meta?: Record<string, unknown>): void;
  /** Info level logging */
  info(message: string, meta?: Record<string, unknown>): void;
  /** Warning level logging */
  warn(message: string, meta?: Record<string, unknown>): void;
  /** Error level logging */
  error(message: string, meta?: Record<string, unknown>): void;
  /** JSON output for CLI (uses presenter) */
  json(data: unknown): void;
  /** Progress updates (uses presenter) */
  progress(payload: import('./presenter/presenter-facade').PresenterProgressPayload): void;
}

/**
 * Plugin API - high-level plugin capabilities
 * Provides cross-plugin invocation, state management, artifacts, shell, events
 *
 * @example
 * ```typescript
 * // Invoke another plugin
 * const result = await ctx.api.invoke<MyResult>({ pluginId: 'other-plugin', input: data });
 *
 * // State management
 * await ctx.api.state.set('key', value, 60000); // 60s TTL
 * const cached = await ctx.api.state.get<MyType>('key');
 *
 * // Events
 * await ctx.api.events.emit('user.created', { userId: '123' });
 * ```
 */
export interface PluginAPI {
  /** Cross-plugin invocation with type-safe results */
  invoke<TResult = unknown>(
    request: import('./invoke/types').InvokeRequest
  ): Promise<import('./invoke/types').InvokeResult<TResult>>;

  /** State management with typed get/set */
  state: {
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
  };

  /** Artifact management (read/write files in outdir) */
  artifacts: {
    read(
      request: import('./artifacts/broker').ArtifactReadRequest
    ): Promise<Buffer | object>;
    write(
      request: import('./artifacts/broker').ArtifactWriteRequest
    ): Promise<{
      path: string;
      meta: import('./artifacts/broker').ArtifactMeta;
    }>;
  };

  /** Shell execution (exec for sync, spawn for streaming) */
  shell: {
    exec(
      command: string,
      args: string[],
      options?: import('./shell/types').ShellExecOptions
    ): Promise<import('./shell/types').ShellResult>;
    spawn(
      command: string,
      args: string[],
      options?: import('./shell/types').ShellSpawnOptions
    ): Promise<import('./shell/types').ShellSpawnResult>;
  };

  /** Event bus with type-safe payloads */
  events: {
    emit<TPayload = unknown>(
      topic: string,
      payload: TPayload,
      options?: import('./events/index').EmitOptions
    ): Promise<EventEnvelope<TPayload> | null>;

    on<TPayload = unknown>(
      topic: string,
      handler: (event: EventEnvelope<TPayload>) => void | Promise<void>,
      options?: import('./events/index').SubscriptionOptions
    ): () => void;

    once<TPayload = unknown>(
      topic: string,
      handler: (event: EventEnvelope<TPayload>) => void | Promise<void>,
      options?: import('./events/index').SubscriptionOptions
    ): () => void;

    off(
      topic: string,
      handler?: (event: EventEnvelope) => void | Promise<void>,
      options?: import('./events/index').SubscriptionOptions
    ): void;

    waitFor<TPayload = unknown>(
      topic: string,
      predicate?: (event: EventEnvelope<TPayload>) => boolean,
      options?: import('./events/index').WaitForOptions<TPayload>
    ): Promise<EventEnvelope<TPayload>>;
  };

  /** Background and scheduled jobs (optional) */
  jobs?: import('./jobs/broker').JobBroker;

  /** Config helper for ensuring config sections exist */
  config: {
    ensureSection: (section: string) => import('./config/config-helper').SmartConfigHelper;
  };

  /** Analytics emitter for custom tracking (scoped to this execution) */
  analytics?: (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult>;
}

/**
 * Runtime API - low-level system capabilities
 * Provides filesystem, HTTP client, and environment variable access
 * These APIs are sandboxed and permission-controlled
 *
 * @example
 * ```typescript
 * // Filesystem
 * const content = await ctx.runtime.fs.readFile('file.txt', { encoding: 'utf-8' });
 *
 * // HTTP
 * const response = await ctx.runtime.fetch('https://api.example.com/data');
 *
 * // Environment
 * const apiKey = ctx.runtime.env('API_KEY');
 * ```
 */
export interface RuntimeAPI {
  /** Filesystem access (shimmed for sandbox, permission-controlled) */
  fs: FSLike;

  /** HTTP client (whitelisted hosts only) */
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

  /** Environment variable accessor (whitelisted keys only) */
  env: (key: string) => string | undefined;
}

/**
 * Legacy RuntimeAPI for backward compatibility
 * @deprecated This type will be removed in v2.0. Use the new separated APIs instead:
 * - ctx.runtime.* for system APIs (fs, fetch, env)
 * - ctx.api.* for plugin APIs (invoke, state, artifacts, shell, events)
 * - ctx.output.* for logging and presentation
 */
export type LegacyRuntimeAPI = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  fs: FSLike;
  env: (key: string) => string | undefined;
  /**
   * Unified logger interface (recommended)
   * @deprecated Use ctx.output.* instead
   * @example ctx.output.info('message', { meta })
   */
  logger: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
  /**
   * @deprecated Use ctx.output.info() instead. Will be removed in v2.0
   * @example ctx.runtime.log('info', 'message', { meta })
   */
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ) => void;
  /**
   * @deprecated Use ctx.api.invoke() instead
   */
  invoke: <T = unknown>(
    request: import('./invoke/types').InvokeRequest
  ) => Promise<import('./invoke/types').InvokeResult<T>>;
  /**
   * @deprecated Use ctx.api.artifacts instead
   */
  artifacts: {
    read: (
      request: import('./artifacts/broker').ArtifactReadRequest
    ) => Promise<Buffer | object>;
    write: (
      request: import('./artifacts/broker').ArtifactWriteRequest
    ) => Promise<{
      path: string;
      meta: import('./artifacts/broker').ArtifactMeta;
    }>;
  };
  /**
   * @deprecated Use ctx.api.shell instead
   */
  shell: {
    exec: (
      command: string,
      args: string[],
      options?: import('./shell/types').ShellExecOptions
    ) => Promise<import('./shell/types').ShellResult>;
    spawn: (
      command: string,
      args: string[],
      options?: import('./shell/types').ShellSpawnOptions
    ) => Promise<import('./shell/types').ShellSpawnResult>;
  };
  /**
   * @deprecated Use ctx.api.analytics instead
   */
  analytics?: (
    event: Partial<TelemetryEvent>
  ) => Promise<TelemetryEmitResult>;
  /**
   * @deprecated Use ctx.api.events instead
   */
  events?: {
    emit<T = unknown>(topic: string, payload: T, options?: import('./events/index').EmitOptions): Promise<EventEnvelope<T> | null>;
    on<T = unknown>(
      topic: string,
      handler: (event: EventEnvelope<T>) => void | Promise<void>,
      options?: import('./events/index').SubscriptionOptions
    ): () => void;
    once<T = unknown>(
      topic: string,
      handler: (event: EventEnvelope<T>) => void | Promise<void>,
      options?: import('./events/index').SubscriptionOptions
    ): () => void;
    off(topic: string, handler?: (event: EventEnvelope) => void | Promise<void>, options?: import('./events/index').SubscriptionOptions): void;
    waitFor<T = unknown>(
      topic: string,
      predicate?: (event: EventEnvelope<T>) => boolean,
      options?: import('./events/index').WaitForOptions<T>
    ): Promise<EventEnvelope<T>>;
  };
  /**
   * @deprecated Use ctx.api.config instead
   */
  config: {
    ensureSection: (section: string) => import('./config/config-helper').SmartConfigHelper;
  };
  /**
   * @deprecated Use ctx.api.state instead
   */
  state?: {
    get<T>(key: string): Promise<T | null>;
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    delete(key: string): Promise<void>;
  };
};

export interface HeaderContext {
  inbound: Record<string, string>;
  sensitive?: string[];
  rateLimitKeys?: Record<string, string>;
}

/**
 * Execution context - runtime information for handler execution
 *
 * @deprecated This type is for internal use only. Will be renamed to InternalExecutionContext in v2.5
 * Plugin code should use PluginContext instead.
 *
 * @internal
 */
export interface ExecutionContext {
  /** Context schema version (semver) */
  version?: string;
  /** Host-provided plugin context (presenter, analytics, events, etc.) */
  pluginContext?: PluginContext;
  
  /** Unique request identifier */
  requestId: string;
  /** Plugin identifier */
  pluginId: string;
  /** Plugin version */
  pluginVersion: string;
  /** Optional tenant identifier (multi-tenant workloads) */
  tenantId?: string;
  /** Route or command identifier */
  routeOrCommand: string;
  /** Working directory (root of execution) */
  workdir: string;
  /** Output directory (for artifacts) */
  outdir?: string;
  /** User context (optional) */
  user?: {
    id?: string;
  };
  /** Debug mode flag */
  debug?: boolean;
  /** Debug level (verbose, inspect, profile) */
  debugLevel?: 'verbose' | 'inspect' | 'profile';
  /** Debug format (ai, human) */
  debugFormat?: 'ai' | 'human';
  /** JSON mode flag */
  jsonMode?: boolean;
  /** Plugin root directory (for module resolution) - REQUIRED */
  pluginRoot: string;
  /** Temporary files created during execution (for cleanup) */
  tmpFiles?: string[];
  /** Distributed trace ID (generated at root, propagated through chain) */
  traceId?: string;
  /** Current span ID */
  spanId?: string;
  /** Parent span ID (for hierarchy) */
  parentSpanId?: string;
  /** Chain limits for protection */
  chainLimits?: ChainLimits;
  /** Chain state tracking */
  chainState?: InvokeContext;
  /** Remaining timeout budget in milliseconds */
  remainingMs?: () => number;
  /** Log stream callback for real-time output (when debug is enabled) */
  onLog?: LogStreamCallback;
  /** Dry-run mode: simulate operations without side effects */
  dryRun?: boolean;
  /** Analytics emitter for custom tracking (scoped to this execution) */
  analytics?: (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult>;
  
  /** Adapter-specific context (typed) */
  adapterContext?: import('@kb-labs/core-sandbox').HandlerContext;
  
  /** Adapter metadata */
  adapterMeta?: import('@kb-labs/core-sandbox').AdapterMetadata;
  
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  
  /** Resource tracker for cleanup */
  resources?: import('@kb-labs/core-sandbox').ResourceTracker;
  
  /** 
   * Extension point for future capabilities
   * 
   * @deprecated Use `runtime` API instead (e.g., `ctx.runtime.invoke()` instead of `ctx.extensions.invoke.invoke()`)
   * This will be removed in a future version. Migrate to runtime API for better type safety and consistency.
   */
  extensions?: RuntimeExtensions & Record<string, unknown>;
  
  /** Lifecycle hooks (optional, for observability) */
  hooks?: import('@kb-labs/core-sandbox').LifecycleHooks;
  /** Sanitized header context propagated from gateway */
  headers?: HeaderContext;
  /** Tracker that collects file/config operations executed imperatively */
  operationTracker?: OperationTracker;
}

/**
 * Execution metrics
 */
export interface ExecMetrics {
  /** Wall-clock time in milliseconds */
  timeMs: number;
  /** CPU time in milliseconds (user + system) */
  cpuMs?: number;
  /** Memory usage in megabytes (RSS) */
  memMb?: number;
}

/**
 * Execute input - parameters for handler execution
 */
export interface ExecuteInput {
  /** Handler reference */
  handler: HandlerRef;
  /** Input data (request body or CLI arguments) */
  input: unknown;
  /** Plugin manifest */
  manifest: ManifestV2;
  /** Resolved permissions (from manifest + system policy) */
  perms: PermissionSpec;
}

/**
 * Execution result - success or error response
 */
export type ExecuteResult =
  | {
      ok: true;
      data: unknown;
      metrics: ExecMetrics;
      /** Plugin logs (only in debug mode) */
      logs?: string[];
      /** Performance profile (only in --debug=profile mode) */
      profile?: import('@kb-labs/core-sandbox').ProfileData;
    }
  | {
      ok: false;
      error: ErrorEnvelope;
      metrics: ExecMetrics;
      /** Plugin logs (only in debug mode) */
      logs?: string[];
      /** Performance profile (only in --debug=profile mode) */
      profile?: import('@kb-labs/core-sandbox').ProfileData;
    };

/**
 * Error context information
 */
export interface ErrorContext {
  location: {
    file?: string;
    function?: string;
    line?: number;
    property?: string;
  };
  availableProperties: string[];
  missingProperties: string[];
  contextSnapshot: Record<string, unknown>;
}

/**
 * Error fix suggestion
 */
export interface ErrorFix {
  description: string;
  code?: string;
  autoApplicable: boolean;
}

/**
 * Error envelope (from api-contracts, extended with debug information)
 */
export type ErrorEnvelope = {
  status: 'error';
  http: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  trace?: string;
  /** Root cause analysis (auto-generated) */
  rootCause?: import('./errors/root-cause').RootCauseAnalysis;
  /** Context information at error time */
  context?: ErrorContext;
  /** Related errors from history */
  relatedErrors?: Array<{
    timestamp: number;
    message: string;
    resolved: boolean;
  }>;
  /** Automatic suggestions for fixing */
  suggestions?: string[];
  /** Specific fixes with code */
  fixes?: ErrorFix[];
  /** Documentation URL */
  documentation?: string;
  meta: {
    requestId: string;
    pluginId: string;
    pluginVersion: string;
    routeOrCommand: string;
    timeMs: number;
    cpuMs?: number;
    memMb?: number;
    perms?: PermissionSpecSummary;
  };
};

/**
 * Permission spec summary (for error metadata, no secrets)
 */
export type PermissionSpecSummary = {
  fs?: {
    mode?: string;
    allowCount?: number;
    denyCount?: number;
  };
  net?: 'none' | { allowHostsCount?: number; denyHostsCount?: number };
  env?: { allowCount?: number };
  quotas?: {
    timeoutMs?: number;
    memoryMb?: number;
    cpuMs?: number;
  };
  capabilities?: string[];
};

import type { InvokeRequest, InvokeResult } from './invoke/types';
import type { ArtifactReadRequest, ArtifactWriteRequest } from './artifacts/broker';
import type { ShellExecOptions, ShellResult, ShellSpawnOptions, ShellSpawnResult } from './shell/types';

/**
 * Plugin handler context - complete context passed to all plugin handlers
 *
 * @example
 * ```typescript
 * export const handler: PluginHandler<Input, Output> = async (input, ctx) => {
 *   // Metadata (flat)
 *   console.log(ctx.requestId, ctx.pluginId);
 *
 *   // System APIs
 *   const data = await ctx.runtime.fs.readFile('file.txt', 'utf-8');
 *   const response = await ctx.runtime.fetch('https://api.example.com');
 *
 *   // Plugin APIs
 *   await ctx.api.invoke({ pluginId: 'other', input: data });
 *   await ctx.api.state.set('key', value, 60000);
 *   await ctx.api.events.emit('event', payload);
 *
 *   // Output
 *   ctx.output.info('Processing complete');
 *   ctx.output.json({ result });
 *
 *   return result;
 * };
 * ```
 */
export interface PluginHandlerContext {
  // === METADATA (flat, serializable) ===
  /** Unique request identifier */
  requestId: string;
  /** Plugin identifier */
  pluginId: string;
  /** Plugin version */
  pluginVersion?: string;
  /** Tenant identifier (multi-tenancy) */
  tenantId?: string;
  /** Output directory for artifacts */
  outdir?: string;
  /** Working directory */
  workdir?: string;
  /** Distributed trace ID */
  traceId?: string;
  /** Current span ID */
  spanId?: string;
  /** Parent span ID */
  parentSpanId?: string;

  // === API GROUPS (created locally, not serialized) ===
  /** System-level APIs (fs, fetch, env) */
  runtime: RuntimeAPI & {
    /**
     * @deprecated Use ctx.output.* instead. Will be removed in v2.0
     */
    logger?: {
      debug: (msg: string, meta?: Record<string, unknown>) => void;
      info: (msg: string, meta?: Record<string, unknown>) => void;
      warn: (msg: string, meta?: Record<string, unknown>) => void;
      error: (msg: string, meta?: Record<string, unknown>) => void;
    };
    /**
     * @deprecated Use ctx.output.* instead. Will be removed in v2.0
     */
    log?: (
      level: 'debug' | 'info' | 'warn' | 'error',
      msg: string,
      meta?: Record<string, unknown>
    ) => void;
    /**
     * @deprecated Use ctx.api.invoke() instead. Will be removed in v2.0
     */
    invoke?: <T = unknown>(request: InvokeRequest) => Promise<InvokeResult<T>>;
    /**
     * @deprecated Use ctx.api.artifacts instead. Will be removed in v2.0
     */
    artifacts?: {
      read: (request: ArtifactReadRequest) => Promise<Buffer | object>;
      write: (request: ArtifactWriteRequest) => Promise<{ path: string; meta: import('./artifacts/broker').ArtifactMeta }>;
    };
    /**
     * @deprecated Use ctx.api.shell instead. Will be removed in v2.0
     */
    shell?: {
      exec: (command: string, args: string[], options?: ShellExecOptions) => Promise<ShellResult>;
      spawn: (command: string, args: string[], options?: ShellSpawnOptions) => Promise<ShellSpawnResult>;
    };
    /**
     * @deprecated Use ctx.api.analytics instead. Will be removed in v2.0
     */
    analytics?: (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult>;
    /**
     * @deprecated Use ctx.api.events instead. Will be removed in v2.0
     */
    events?: {
      emit<T = unknown>(topic: string, payload: T, options?: import('./events/index').EmitOptions): Promise<import('./events/index').EventEnvelope<T> | null>;
      on<T = unknown>(
        topic: string,
        handler: (event: import('./events/index').EventEnvelope<T>) => void | Promise<void>,
        options?: import('./events/index').SubscriptionOptions
      ): () => void;
      once<T = unknown>(
        topic: string,
        handler: (event: import('./events/index').EventEnvelope<T>) => void | Promise<void>,
        options?: import('./events/index').SubscriptionOptions
      ): () => void;
      off(
        topic: string,
        handler?: (event: import('./events/index').EventEnvelope) => void | Promise<void>,
        options?: import('./events/index').SubscriptionOptions
      ): void;
      waitFor<T = unknown>(
        topic: string,
        predicate?: (event: import('./events/index').EventEnvelope<T>) => boolean,
        options?: import('./events/index').WaitForOptions<T>
      ): Promise<import('./events/index').EventEnvelope<T>>;
    };
    /**
     * @deprecated Use ctx.api.config instead. Will be removed in v2.0
     */
    config?: {
      ensureSection: (
        pointer: string,
        value: unknown,
        options?: import('./config/config-helper').EnsureSectionOptions
      ) => Promise<import('./config/config-helper').EnsureSectionResult>;
    };
    /**
     * @deprecated Use ctx.api.state instead. Will be removed in v2.0
     */
    state?: {
      get<T>(key: string): Promise<T | null>;
      set<T>(key: string, value: T, ttl?: number): Promise<void>;
      delete(key: string): Promise<void>;
    };
  };

  /** Plugin-level APIs (invoke, state, artifacts, shell, events, jobs) - NEW! */
  api?: PluginAPI;

  /** Output and logging API - NEW! */
  output?: PluginOutput;
}

/**
 * Plugin handler signature - unified contract for all handlers
 *
 * @template TInput - Type of input data (default: unknown)
 * @template TOutput - Type of output data (default: unknown)
 *
 * @example
 * ```typescript
 * // Simple handler
 * export const handler: PluginHandler = async (input, ctx) => {
 *   ctx.output.info('Processing');
 *   return { result: 'ok' };
 * };
 *
 * // Typed handler
 * type Input = { userId: string };
 * type Output = { user: User };
 *
 * export const handler: PluginHandler<Input, Output> = async (input, ctx) => {
 *   const user = await fetchUser(input.userId); // input is typed!
 *   return { user }; // return must match Output
 * };
 * ```
 */
export type PluginHandler<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  ctx: PluginHandlerContext
) => Promise<TOutput>;

/**
 * Filesystem-like interface (promise-based, similar to fs/promises)
 */
export interface FSLike {
  readFile: (
    path: string,
    options?: { encoding?: BufferEncoding }
  ) => Promise<string | Buffer>;
  writeFile: (
    path: string,
    data: string | Buffer,
    options?: { encoding?: BufferEncoding }
  ) => Promise<void>;
  readdir: (path: string) => Promise<string[]>;
  stat: (path: string) => Promise<{
    isFile: () => boolean;
    isDirectory: () => boolean;
    size: number;
    mtime: Date;
  }>;
  mkdir: (
    path: string,
    options?: { recursive?: boolean }
  ) => Promise<void>;
  unlink: (path: string) => Promise<void>;
  rmdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
}

