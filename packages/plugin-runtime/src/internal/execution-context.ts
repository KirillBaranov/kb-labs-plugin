/**
 * @module @kb-labs/plugin-runtime/internal/execution-context
 * @internal
 * DO NOT USE in plugin code!
 *
 * Internal execution context used by runtime.execute() to pass context between layers.
 * This is serialized and passed via IPC to child process.
 */

import type { PluginContext } from '../context/plugin-context';
import type { ChainLimits, InvokeContext } from '../invoke/types';
import type { OperationTracker } from '../operations/operation-tracker';
import type { TelemetryEvent, TelemetryEmitResult } from '@kb-labs/core-types';
import type {
  AdapterMetadata,
  HandlerContext,
  LifecycleHooks,
  ResourceTracker,
} from '@kb-labs/core-sandbox';

/**
 * Log stream callback for real-time log output
 */
export type LogStreamCallback = (line: string, level: 'info' | 'warn' | 'error' | 'debug') => void;

/**
 * Header context for REST requests
 */
export interface HeaderContext {
  inbound: Record<string, string>;
  sensitive?: string[];
  rateLimitKeys?: Record<string, string>;
}

/**
 * Internal execution context - used only by runtime.execute()
 *
 * This context is NOT exposed to plugin code. Plugins see only PluginContext.
 *
 * @internal
 * DO NOT export from main index.ts!
 */
export interface InternalExecutionContext {
  /** Context schema version (semver) */
  version?: string;

  /** Host-provided plugin context (what handlers actually see) */
  pluginContext?: PluginContext;

  // === Request metadata ===
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

  // === Execution environment ===
  /** Working directory (root of execution) */
  workdir: string;
  /** Output directory (for artifacts) */
  outdir?: string;
  /** Plugin root directory (for module resolution) - REQUIRED */
  pluginRoot: string;
  /** Temporary files created during execution (for cleanup) */
  tmpFiles?: string[];

  // === User context ===
  /** User context (optional) */
  user?: {
    id?: string;
  };

  // === Debug & observability ===
  /** Debug mode flag */
  debug?: boolean;
  /** Debug level (verbose, inspect, profile) */
  debugLevel?: 'verbose' | 'inspect' | 'profile';
  /** Debug format (ai, human) */
  debugFormat?: 'ai' | 'human';
  /** JSON mode flag */
  jsonMode?: boolean;
  /** Distributed trace ID (generated at root, propagated through chain) */
  traceId?: string;
  /** Current span ID */
  spanId?: string;
  /** Parent span ID (for hierarchy) */
  parentSpanId?: string;
  /** Log stream callback for real-time output (when debug is enabled) */
  onLog?: LogStreamCallback;

  // === Chain management ===
  /** Chain limits for protection */
  chainLimits?: ChainLimits;
  /** Chain state tracking */
  chainState?: InvokeContext;
  /** Remaining timeout budget in milliseconds */
  remainingMs?: () => number;

  // === Execution controls ===
  /** Dry-run mode: simulate operations without side effects */
  dryRun?: boolean;
  /** Abort signal for cancellation */
  signal?: AbortSignal;

  // === Analytics ===
  /** Analytics emitter for custom tracking (scoped to this execution) */
  analytics?: (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult>;

  // === Adapter integration ===
  /** Adapter-specific context (typed) */
  adapterContext?: HandlerContext;
  /** Adapter metadata */
  adapterMeta?: AdapterMetadata;
  /** Sanitized header context propagated from gateway (REST only) */
  headers?: HeaderContext;

  // === Resource management ===
  /** Resource tracker for cleanup */
  resources?: ResourceTracker;
  /** Tracker that collects file/config operations executed imperatively */
  operationTracker?: OperationTracker;

  // === Lifecycle ===
  /** Lifecycle hooks (optional, for observability) */
  hooks?: LifecycleHooks;
}
