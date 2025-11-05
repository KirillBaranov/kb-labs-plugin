/**
 * @module @kb-labs/plugin-runtime/types
 * Execution types for plugin runtime
 */

import type { ManifestV2, PermissionSpec } from '@kb-labs/plugin-manifest';

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
 */
export interface RuntimeExtensions {
  /** Artifact broker for reading/writing artifacts */
  artifacts?: import('./artifacts/broker.js').ArtifactBroker;
  /** Invoke broker for cross-plugin invocation */
  invoke?: import('./invoke/broker.js').InvokeBroker;
}

/**
 * Execution context - runtime information for handler execution
 */
export interface ExecutionContext {
  /** Context schema version (semver) */
  version?: string;
  
  /** Unique request identifier */
  requestId: string;
  /** Plugin identifier */
  pluginId: string;
  /** Plugin version */
  pluginVersion: string;
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
  analytics?: (event: Partial<import('@kb-labs/analytics-sdk-node').AnalyticsEventV1>) => Promise<import('@kb-labs/analytics-sdk-node').EmitResult>;
  
  /** Adapter-specific context (typed) */
  adapterContext?: import('@kb-labs/sandbox').HandlerContext;
  
  /** Adapter metadata */
  adapterMeta?: import('@kb-labs/sandbox').AdapterMetadata;
  
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  
  /** Resource tracker for cleanup */
  resources?: import('@kb-labs/sandbox').ResourceTracker;
  
  /** Extension point for future capabilities */
  extensions?: RuntimeExtensions & Record<string, unknown>;
  
  /** Lifecycle hooks (optional, for observability) */
  hooks?: import('@kb-labs/sandbox').LifecycleHooks;
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
 * Error envelope (from api-contracts)
 */
export type ErrorEnvelope = {
  status: 'error';
  http: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  trace?: string;
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
      /** Structured logging */
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
      /** Analytics emitter for custom tracking (scoped to this execution) */
      analytics?: (event: Partial<import('@kb-labs/analytics-sdk-node').AnalyticsEventV1>) => Promise<import('@kb-labs/analytics-sdk-node').EmitResult>;
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

