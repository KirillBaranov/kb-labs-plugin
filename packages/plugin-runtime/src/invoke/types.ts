/**
 * @module @kb-labs/plugin-runtime/invoke/types
 * Types for cross-plugin invocation
 */

import type { ErrorEnvelope } from '../types';

// Re-export types from plugin-contracts for convenience
export type { MountSpec, InvokeRequest, ChainLimits, InvokeContext } from '@kb-labs/plugin-contracts';

/**
 * Invoke result with runtime-specific ErrorEnvelope
 * Extended from base InvokeResult to include ErrorEnvelope type
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
      error: ErrorEnvelope; // Runtime-specific extension
    };
