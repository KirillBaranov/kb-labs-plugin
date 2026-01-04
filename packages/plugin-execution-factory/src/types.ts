/**
 * @module @kb-labs/plugin-execution/types
 *
 * Core type definitions for the Execution Layer.
 * These types are the CONTRACT - do not change without versioning.
 *
 * ## Type Strategy: Composition (v3)
 *
 * We use PluginContextDescriptor from plugin-contracts DIRECTLY.
 * No custom ExecutionDescriptor, no converters, no custom HostContext.
 *
 * ExecutionRequest = PluginContextDescriptor + execution-specific fields
 *
 * This means:
 * - `request.descriptor` is passed to `runInProcess()` as-is
 * - Execution-specific fields (pluginRoot, handlerRef, timeout) are separate
 * - No type conversion code = no bugs from conversion
 * - HostContext uses runtime types (host: 'cli' | 'rest' | 'workflow' | 'webhook' | 'cron')
 */

import type {
  PlatformServices,
  PluginContextV3,
  PluginContextDescriptor,
  HostContext,
  HostType,
  PermissionSpec,
  UIFacade,
  ExecutionMeta,
} from '@kb-labs/plugin-contracts';

// Re-export runtime types for convenience (consumers use these, not custom types)
export type { PluginContextDescriptor, HostContext, HostType, PermissionSpec };

// ============================================================================
// Protocol Version
// ============================================================================

/**
 * Current protocol version.
 * Increment when making breaking changes to ExecutionRequest/ExecutionResult.
 */
export const PROTOCOL_VERSION = 1 as const;

// ============================================================================
// Handler Contract
// ============================================================================

/**
 * Plugin handler contract - UNIFIED for all handler types.
 * All handlers MUST export default satisfying this interface.
 *
 * @example
 * ```typescript
 * // my-handler.ts
 * export default {
 *   execute: async (ctx, input) => {
 *     return { success: true };
 *   }
 * } satisfies PluginHandler;
 * ```
 */
export interface PluginHandler<TInput = unknown, TOutput = unknown> {
  /** Main execution method */
  execute(ctx: PluginContextV3, input: TInput): Promise<TOutput>;

  /** Optional: describe handler for tooling/introspection */
  describe?(): HandlerMetadata;

  /** Optional: input/output schema for validation */
  schema?(): HandlerSchema;

  /** Optional: warmup hook for preloading resources */
  warmup?(): Promise<void>;
}

/**
 * Handler metadata for tooling
 */
export interface HandlerMetadata {
  name: string;
  description?: string;
  version?: string;
  tags?: string[];
}

/**
 * Handler schema for validation
 */
export interface HandlerSchema {
  input?: unknown;   // JSON Schema or Zod schema
  output?: unknown;  // JSON Schema or Zod schema
}

// ============================================================================
// Execution Request
// ============================================================================

/**
 * Execution request - universal for all handler types.
 * This is what consumers pass to backend.execute().
 *
 * ## Composition Approach
 *
 * `descriptor` is PluginContextDescriptor from plugin-contracts.
 * It is passed to runInProcess() AS-IS, no conversion needed.
 *
 * ## Separation of Concerns (v4)
 *
 * - `descriptor` = runtime context (permissions, hostContext, config)
 * - `executionId` = execution layer tracing (NOT same as descriptor.requestId)
 * - `pluginRoot/handlerRef` = file resolution (execution layer concern)
 * - `timeoutMs/workspace/artifacts` = execution configuration
 *
 * Note: descriptor.requestId is for request correlation in distributed tracing.
 * executionId is for this specific execution attempt (may retry same requestId).
 */
export interface ExecutionRequest {
  /**
   * Unique execution ID for this attempt.
   *
   * NOT same as descriptor.requestId:
   * - requestId: correlates requests across services (e.g., from HTTP header)
   * - executionId: identifies this specific execution attempt
   *
   * Same request can be retried = same requestId, different executionId.
   *
   * @example "exec_12345_1703088000000_a1b2c3d4"
   */
  executionId: string;

  /**
   * Runtime descriptor - passed to runInProcess() directly.
   * Contains all data needed for PluginContextV3 creation.
   *
   * NOTE: This is PluginContextDescriptor from @kb-labs/plugin-contracts.
   * No conversion needed - backend passes it as-is to runtime.
   */
  descriptor: PluginContextDescriptor;

  /**
   * Where plugin files live (absolute path).
   * Handler path resolved as: path.resolve(pluginRoot, handlerRef)
   *
   * Execution-layer concern: runtime doesn't need this after handler is loaded.
   */
  pluginRoot: string;

  /**
   * Handler reference - relative path inside plugin.
   * NOT absolute path! Resolved via pluginRoot.
   *
   * @example "dist/handlers/release.js"
   */
  handlerRef: string;

  /**
   * Export name from handler file (default: "default").
   * Used for handlers that export multiple functions.
   *
   * @example "generatePlan" for named export
   */
  exportName?: string;

  /**
   * Input data passed to handler.execute(ctx, input).
   */
  input: unknown;

  /**
   * Workspace configuration.
   * Defaults to local workspace if not specified.
   *
   * NOTE: For remote executor (Phase 3), workspace.type must be 'ephemeral'
   * with repo info for materialization.
   */
  workspace?: WorkspaceConfig;

  /**
   * Artifacts configuration.
   * Where to store output files.
   */
  artifacts?: ArtifactsConfig;

  /**
   * Timeout in milliseconds.
   * Default: 30000 (30 seconds)
   */
  timeoutMs?: number;
}

// ============================================================================
// Workspace Configuration
// ============================================================================

/**
 * Workspace configuration.
 * Defaults to 'local' type with process.cwd().
 */
export interface WorkspaceConfig {
  /**
   * Workspace type.
   * - 'local': Use local filesystem (default)
   * - 'ephemeral': Create temporary workspace (for remote executor)
   */
  type?: 'local' | 'ephemeral';

  /**
   * Current working directory.
   * Where handler executes (may differ from pluginRoot).
   */
  cwd?: string;

  /**
   * Repository info (for ephemeral workspaces).
   */
  repo?: {
    url: string;
    ref: string;
    commit?: string;
  };

  /**
   * Filter for partial checkout (ephemeral only).
   */
  filter?: {
    include?: string[];
    exclude?: string[];
  };

  /**
   * Snapshot ID for reuse (optimization).
   */
  snapshotId?: string;
}

// ============================================================================
// Artifacts Configuration
// ============================================================================

/**
 * Artifacts configuration.
 */
export interface ArtifactsConfig {
  /** Output directory for artifacts */
  outdir?: string;

  /** Upload artifacts to storage after execution */
  upload?: boolean;

  /** Artifact patterns to collect */
  patterns?: string[];
}

// ============================================================================
// Execution Result
// ============================================================================

/**
 * Execution result - returned by backend.execute().
 */
export interface ExecutionResult {
  /** Success flag */
  ok: boolean;

  /** Result data (if ok) */
  data?: unknown;

  /** Error details (if !ok) */
  error?: ExecutionError;

  /** Execution time in milliseconds */
  executionTimeMs: number;

  /** Artifact IDs produced (if any) */
  artifactIds?: string[];

  /** Metadata for observability */
  metadata?: ExecutionMetadata;

  /** Allow additional fields for extensibility */
  [key: string]: unknown;
}

/**
 * Structured error with code and details.
 */
export interface ExecutionError {
  /** Human-readable error message */
  message: string;

  /**
   * Error code for programmatic handling.
   * Use standardized codes for consistency.
   */
  code?: ExecutionErrorCode;

  /** Stack trace (if available) */
  stack?: string;

  /** Additional error details */
  details?: Record<string, unknown>;

  /** Allow additional fields for extensibility */
  [key: string]: unknown;
}

/**
 * Standardized error codes.
 *
 * Phase 1: Core codes (all implemented)
 * Phase 2: Pool-specific codes (reserved, not yet implemented)
 */
export type ExecutionErrorCode =
  // Phase 1: Core codes
  | 'TIMEOUT'               // Handler execution timed out
  | 'ABORTED'               // Execution aborted via signal
  | 'PERMISSION_DENIED'     // Handler lacks required permissions
  | 'HANDLER_ERROR'         // Handler threw an error
  | 'HANDLER_CONTRACT_ERROR'// Handler doesn't export execute()
  | 'HANDLER_NOT_FOUND'     // Handler file doesn't exist
  | 'WORKSPACE_ERROR'       // Failed to lease/release workspace
  | 'VALIDATION_ERROR'      // Input/output schema violation
  | 'UNKNOWN_ERROR'         // Unexpected error
  // Phase 2: Pool-specific codes (reserved)
  | 'QUEUE_FULL'            // 429 - Queue at capacity
  | 'ACQUIRE_TIMEOUT'       // 503 - No worker available in time
  | 'WORKER_CRASHED'        // 500 - Worker process died
  | 'WORKER_UNHEALTHY';     // 503 - Worker health check failed

/**
 * Execution metadata for observability.
 */
export interface ExecutionMetadata {
  /** Worker ID (for pool backends) */
  workerId?: string;

  /** Workspace ID used */
  workspaceId?: string;

  /** Peak memory usage in MB */
  memoryUsedMB?: number;

  /** Whether handler was pre-warmed */
  handlerWasWarmed?: boolean;

  /** Backend type used */
  backend?: 'in-process' | 'subprocess' | 'worker-pool' | 'remote';

  /**
   * Execution metadata from runner layer (v5).
   * Contains timing, plugin info, and request correlation data.
   * This is the host-agnostic execution info from RunResult.
   */
  executionMeta?: ExecutionMeta;
}

// ============================================================================
// Execution Backend Interface
// ============================================================================

/**
 * Execution backend interface - ONE interface for ALL execution.
 *
 * Implementations:
 * - InProcessBackend (Level 0)
 * - WorkerPoolBackend (Level 1)
 * - RemoteExecutionBackend (Level 2)
 */
export interface ExecutionBackend {
  /**
   * Execute handler.
   * This is the main entry point for all execution.
   */
  execute(
    request: ExecutionRequest,
    options?: ExecuteOptions
  ): Promise<ExecutionResult>;

  /**
   * Health check.
   * Returns current health status of backend.
   */
  health(): Promise<HealthStatus>;

  /**
   * Execution statistics.
   * Returns aggregated stats for monitoring.
   */
  stats(): Promise<ExecutionStats>;

  /**
   * Graceful shutdown.
   * Clean up resources, wait for pending executions.
   */
  shutdown(): Promise<void>;

  /**
   * Optional: Initialize backend.
   * Called once at startup for backends that need setup.
   */
  start?(): Promise<void>;
}

/**
 * Execute options.
 */
export interface ExecuteOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Health status.
 */
export interface HealthStatus {
  /** Overall health */
  healthy: boolean;

  /** Backend type */
  backend: 'in-process' | 'subprocess' | 'worker-pool' | 'remote';

  /** Backend-specific details */
  details?: {
    workers?: {
      total: number;
      idle: number;
      busy: number;
    };
    activeSubprocesses?: number;
    uptimeMs?: number;
    lastError?: string;
  };
}

/**
 * Execution statistics.
 */
export interface ExecutionStats {
  /** Total executions since start */
  totalExecutions: number;

  /** Successful executions */
  successCount: number;

  /** Failed executions */
  errorCount: number;

  /** Average execution time in ms */
  avgExecutionTimeMs: number;

  /** 95th percentile execution time */
  p95ExecutionTimeMs?: number;

  /** 99th percentile execution time */
  p99ExecutionTimeMs?: number;
}

// ============================================================================
// Backend Options
// ============================================================================

/**
 * Backend options for factory.
 */
export interface BackendOptions {
  /**
   * Execution mode.
   * - 'auto': Detect based on environment (default)
   * - 'in-process': Always use InProcessBackend (same process, no isolation)
   * - 'subprocess': Always use SubprocessBackend (single subprocess, process isolation)
   * - 'worker-pool': Always use WorkerPoolBackend (pool of workers, production-ready)
   * - 'remote': Always use RemoteExecutionBackend (remote executor service)
   */
  mode?: 'auto' | 'in-process' | 'subprocess' | 'worker-pool' | 'remote';

  /**
   * Platform services.
   * REQUIRED for in-process and worker-pool modes.
   */
  platform: PlatformServices;

  /**
   * UI provider for CLI execution.
   *
   * By default, backend uses noopUI (silent).
   * For CLI, pass a function that returns real UI based on host type.
   *
   * @example
   * ```typescript
   * uiProvider: (hostType) => hostType === 'cli' ? cliUI : noopUI
   * ```
   */
  uiProvider?: (hostType: HostType) => UIFacade;

  /**
   * Worker pool options (only for worker-pool mode).
   */
  workerPool?: WorkerPoolOptions;

  /**
   * Remote executor options (only for remote mode).
   */
  remote?: RemoteOptions;
}

/**
 * Worker pool options.
 */
export interface WorkerPoolOptions {
  /** Minimum workers (default: 2) */
  min?: number;

  /** Maximum workers (default: 10) */
  max?: number;

  /** Max requests per worker before recycle (default: 1000) */
  maxRequestsPerWorker?: number;

  /** Max uptime per worker before recycle in ms (default: 30 min) */
  maxUptimeMsPerWorker?: number;

  /** Max concurrent executions per plugin (default: no limit) */
  maxConcurrentPerPlugin?: number;

  /** Warmup policy */
  warmup?: WarmupPolicy;
}

/**
 * Warmup policy for worker pool.
 *
 * NOTE: 'all' mode removed - too dangerous (can OOM with many handlers).
 * Use 'marked' or 'top-n' instead.
 */
export interface WarmupPolicy {
  /**
   * Warmup mode.
   * - 'none': No warmup (cold start on first request)
   * - 'top-n': Warmup top N most-used handlers
   * - 'marked': Warmup handlers marked with warmup: true in manifest
   */
  mode: 'none' | 'top-n' | 'marked';

  /** For 'top-n': how many handlers to warmup (default: 5) */
  topN?: number;

  /** Max handlers to warmup (safety limit, default: 20) */
  maxHandlers?: number;
}

/**
 * Remote executor options.
 */
export interface RemoteOptions {
  /** Executor service endpoint (gRPC) */
  endpoint: string;

  /** Timeout for executor calls in ms (default: 60000) */
  timeoutMs?: number;

  /** Retry policy */
  retry?: {
    maxAttempts: number;
    backoffMs: number;
  };
}
