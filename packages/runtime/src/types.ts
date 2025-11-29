/**
 * @module @kb-labs/plugin-runtime/types
 * Execution types for plugin runtime
 */

import type { ManifestV2, PermissionSpec } from '@kb-labs/plugin-manifest';
import type { PluginContext } from './context/plugin-context.js';
import type {
  EventBus,
  EventBusConfig,
  EventEnvelope,
  EventScope,
} from './events/index.js';
import type { AnalyticsEmitter } from './analytics/emitter.js';
import type { OperationTracker } from './operations/operation-tracker.js';
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

import type { ChainLimits, InvokeContext } from './invoke/types.js';

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
  artifacts?: import('./artifacts/broker.js').ArtifactBroker;
  /** Invoke broker for cross-plugin invocation */
  invoke?: import('./invoke/broker.js').InvokeBroker;
  /** Shell broker for command execution */
  shell?: import('./shell/broker.js').ShellBroker;
  /** Job broker for background and scheduled jobs */
  jobs?: import('./jobs/broker.js').JobBroker;
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
 * Runtime API for plugin handlers
 * Provides low-level system APIs (fetch, fs, env, shell, invoke, artifacts)
 */
export type RuntimeAPI = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  fs: FSLike;
  env: (key: string) => string | undefined;
  /**
   * Unified logger interface (recommended)
   * @example ctx.logger.info('message', { meta })
   */
  logger: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
  /**
   * @deprecated Use ctx.logger.info() instead. Will be removed in v2.0
   * @example ctx.runtime.log('info', 'message', { meta })
   */
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ) => void;
  invoke: <T = unknown>(
    request: import('./invoke/types.js').InvokeRequest
  ) => Promise<import('./invoke/types.js').InvokeResult<T>>;
  artifacts: {
    read: (
      request: import('./artifacts/broker.js').ArtifactReadRequest
    ) => Promise<Buffer | object>;
    write: (
      request: import('./artifacts/broker.js').ArtifactWriteRequest
    ) => Promise<{
      path: string;
      meta: import('./artifacts/broker.js').ArtifactMeta;
    }>;
  };
  shell: {
    exec: (
      command: string,
      args: string[],
      options?: import('./shell/types.js').ShellExecOptions
    ) => Promise<import('./shell/types.js').ShellResult>;
    spawn: (
      command: string,
      args: string[],
      options?: import('./shell/types.js').ShellSpawnOptions
    ) => Promise<import('./shell/types.js').ShellSpawnResult>;
  };
  analytics?: (
    event: Partial<TelemetryEvent>
  ) => Promise<TelemetryEmitResult>;
  events?: {
    emit<T = unknown>(topic: string, payload: T, options?: import('./events/index.js').EmitOptions): Promise<EventEnvelope<T> | null>;
    on<T = unknown>(
      topic: string,
      handler: (event: EventEnvelope<T>) => void | Promise<void>,
      options?: import('./events/index.js').SubscriptionOptions
    ): () => void;
    once<T = unknown>(
      topic: string,
      handler: (event: EventEnvelope<T>) => void | Promise<void>,
      options?: import('./events/index.js').SubscriptionOptions
    ): () => void;
    off(topic: string, handler?: (event: EventEnvelope) => void | Promise<void>, options?: import('./events/index.js').SubscriptionOptions): void;
    waitFor<T = unknown>(
      topic: string,
      predicate?: (event: EventEnvelope<T>) => boolean,
      options?: import('./events/index.js').WaitForOptions<T>
    ): Promise<EventEnvelope<T>>;
  };
  config: {
    ensureSection: (section: string) => import('./config/config-helper.js').SmartConfigHelper;
  };
};

export interface HeaderContext {
  inbound: Record<string, string>;
  sensitive?: string[];
  rateLimitKeys?: Record<string, string>;
}

/**
 * Execution context - runtime information for handler execution
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
  adapterContext?: import('@kb-labs/sandbox').HandlerContext;
  
  /** Adapter metadata */
  adapterMeta?: import('@kb-labs/sandbox').AdapterMetadata;
  
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  
  /** Resource tracker for cleanup */
  resources?: import('@kb-labs/sandbox').ResourceTracker;
  
  /** 
   * Extension point for future capabilities
   * 
   * @deprecated Use `runtime` API instead (e.g., `ctx.runtime.invoke()` instead of `ctx.extensions.invoke.invoke()`)
   * This will be removed in a future version. Migrate to runtime API for better type safety and consistency.
   */
  extensions?: RuntimeExtensions & Record<string, unknown>;
  
  /** Lifecycle hooks (optional, for observability) */
  hooks?: import('@kb-labs/sandbox').LifecycleHooks;
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
      profile?: import('@kb-labs/sandbox').ProfileData;
    }
  | {
      ok: false;
      error: ErrorEnvelope;
      metrics: ExecMetrics;
      /** Plugin logs (only in debug mode) */
      logs?: string[];
      /** Performance profile (only in --debug=profile mode) */
      profile?: import('@kb-labs/sandbox').ProfileData;
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
  rootCause?: import('./errors/root-cause.js').RootCauseAnalysis;
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

import type { InvokeRequest, InvokeResult } from './invoke/types.js';
import type { ArtifactReadRequest, ArtifactWriteRequest } from './artifacts/broker.js';
import type { ShellExecOptions, ShellResult, ShellSpawnOptions, ShellSpawnResult } from './shell/types.js';

/**
 * Plugin handler signature - unified contract for all handlers
 */
export type PluginHandler = (
  input: unknown,
  ctx: {
    requestId: string;
    pluginId: string;
    outdir?: string;
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    runtime: {
      /** Whitelisted network fetch */
      fetch: typeof fetch;
      /** Shimmed filesystem (promise-based) */
      fs: FSLike;
      /** Whitelisted environment variable access */
      env: (key: string) => string | undefined;
      /** Unified logger interface (recommended) */
      logger: {
        debug: (msg: string, meta?: Record<string, unknown>) => void;
        info: (msg: string, meta?: Record<string, unknown>) => void;
        warn: (msg: string, meta?: Record<string, unknown>) => void;
        error: (msg: string, meta?: Record<string, unknown>) => void;
      };
      /** @deprecated Structured logging - use ctx.runtime.logger instead */
      log: (
        level: 'debug' | 'info' | 'warn' | 'error',
        msg: string,
        meta?: Record<string, unknown>
      ) => void;
      /** Cross-plugin invocation */
      invoke: <T = unknown>(request: InvokeRequest) => Promise<InvokeResult<T>>;
      /** Artifact access */
      artifacts: {
        read: (request: ArtifactReadRequest) => Promise<Buffer | object>;
        write: (request: ArtifactWriteRequest) => Promise<{ path: string; meta: import('./artifacts/broker.js').ArtifactMeta }>;
      };
      /** Shell execution */
      shell: {
        exec: (command: string, args: string[], options?: ShellExecOptions) => Promise<ShellResult>;
        spawn: (command: string, args: string[], options?: ShellSpawnOptions) => Promise<ShellSpawnResult>;
      };
      /** Analytics emitter for custom tracking (scoped to this execution) */
      analytics?: (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult>;
      /** Event bus API */
      events?: {
        emit<T = unknown>(topic: string, payload: T, options?: import('./events/index.js').EmitOptions): Promise<import('./events/index.js').EventEnvelope<T> | null>;
        on<T = unknown>(
          topic: string,
          handler: (event: import('./events/index.js').EventEnvelope<T>) => void | Promise<void>,
          options?: import('./events/index.js').SubscriptionOptions
        ): () => void;
        once<T = unknown>(
          topic: string,
          handler: (event: import('./events/index.js').EventEnvelope<T>) => void | Promise<void>,
          options?: import('./events/index.js').SubscriptionOptions
        ): () => void;
        off(
          topic: string,
          handler?: (event: import('./events/index.js').EventEnvelope) => void | Promise<void>,
          options?: import('./events/index.js').SubscriptionOptions
        ): void;
        waitFor<T = unknown>(
          topic: string,
          predicate?: (event: import('./events/index.js').EventEnvelope<T>) => boolean,
          options?: import('./events/index.js').WaitForOptions<T>
        ): Promise<import('./events/index.js').EventEnvelope<T>>;
      };
      /** Config helper */
      config: {
        ensureSection: (
          pointer: string,
          value: unknown,
          options?: import('./config/config-helper.js').EnsureSectionOptions
        ) => Promise<import('./config/config-helper.js').EnsureSectionResult>;
      };
    };
  }
) => Promise<unknown>;

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

