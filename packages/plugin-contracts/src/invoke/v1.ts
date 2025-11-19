/**
 * @module @kb-labs/plugin-contracts/invoke/v1
 * Invoke API v1 type definitions
 * 
 * Versioning policy:
 * - MAJOR: Breaking changes in API (e.g., removing methods, changing signatures)
 * - MINOR: New fields added (backward compatible)
 * - PATCH: Type corrections, documentation updates
 */

/**
 * Session mount specification
 */
export interface MountSpecV1 {
  type: 'memory' | 'volume';
  name: string;
  mode: 'ro' | 'rw';
  data?: unknown;
  sizeMb?: number;
}

/**
 * Invoke request
 */
export interface InvokeRequestV1 {
  /** Canonical target: @pluginId@<semver>|latest:METHOD /path */
  target: string;
  /** Input data for the target handler */
  input?: unknown;
  /** Explicit headers supplied by caller (used when headerPolicy === 'explicit') */
  headers?: Record<string, string>;
  /** Header forwarding strategy */
  headerPolicy?: 'none' | 'inherit-allowed' | 'explicit';
  /** System header propagation strategy (default: auto) */
  systemHeaders?: 'auto' | 'always' | 'never';
  /** Session context for trace propagation and mounts */
  session?: {
    traceId?: string;
    parentSpanId?: string;
    mounts?: MountSpecV1[];
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
export type InvokeResultV1<T = unknown> =
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
      error: unknown; // Error envelope (runtime-specific, not part of contract)
    };

/**
 * Chain limits for protection against infinite loops and resource exhaustion
 */
export interface ChainLimitsV1 {
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
export interface InvokeContextV1 {
  /** Current chain depth (0 at root) */
  depth: number;
  /** Current fan-out count */
  fanOut: number;
  /** List of visited plugin IDs (for cycle detection) */
  visited: string[];
  /** Remaining timeout budget in milliseconds */
  remainingMs: number;
}

/**
 * Invoke API v1 interface
 * Provides cross-plugin invocation
 */
export interface InvokeApiV1 {
  /**
   * Invoke another plugin's handler
   * @param request - Invoke request with target, input, and options
   * @returns Promise resolving to invoke result
   */
  invoke<T = unknown>(request: InvokeRequestV1): Promise<InvokeResultV1<T>>;
}

