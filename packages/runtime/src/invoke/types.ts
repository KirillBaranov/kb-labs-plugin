/**
 * @module @kb-labs/plugin-runtime/invoke/types
 * Types for cross-plugin invocation
 */

import type { ErrorEnvelope } from '../types.js';

/**
 * Session mount specification
 */
export interface MountSpec {
  type: 'memory' | 'volume';
  name: string;
  mode: 'ro' | 'rw';
  data?: unknown;
  sizeMb?: number;
}

/**
 * Invoke request
 */
export interface InvokeRequest {
  /** Canonical target: @pluginId@<semver>|latest:METHOD /path */
  target: string;
  /** Input data for the target handler */
  input?: unknown;
  /** Session context for trace propagation and mounts */
  session?: {
    traceId?: string;
    parentSpanId?: string;
    mounts?: MountSpec[];
  };
  /** Optional quota overrides (stricter-wins policy) */
  quotasOverride?: Partial<{
    timeoutMs: number;
    memoryMb: number;
    cpuMs: number;
  }>;
  /** Optional idempotency key for retry-safe operations */
  idempotencyKey?: string;
}

/**
 * Invoke result
 */
export type InvokeResult<T = unknown> =
  | {
      ok: true;
      data: T;
      meta: {
        timeMs: number;
        spanId?: string;
      };
    }
  | {
      ok: false;
      error: ErrorEnvelope;
    };

/**
 * Chain limits for protection against infinite loops and resource exhaustion
 */
export interface ChainLimits {
  /** Maximum chain depth (default: 8) */
  maxDepth: number;
  /** Maximum concurrent invokes from one plugin (default: 16) */
  maxFanOut: number;
  /** Maximum total chain time in milliseconds */
  maxChainTime: number;
}

/**
 * Invoke context tracking chain state
 */
export interface InvokeContext {
  /** Current chain depth (0 at root) */
  depth: number;
  /** Current fan-out count */
  fanOut: number;
  /** List of visited plugin IDs (for cycle detection) */
  visited: string[];
  /** Remaining timeout budget in milliseconds */
  remainingMs: number;
}

