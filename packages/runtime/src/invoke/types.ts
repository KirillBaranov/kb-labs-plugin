/**
 * @module @kb-labs/plugin-runtime/invoke/types
 * Types for cross-plugin invocation
 * 
 * @deprecated Import from @kb-labs/plugin-contracts instead
 * This file is kept for backward compatibility and re-exports from contracts
 */

import type { ErrorEnvelope } from '../types.js';
import type {
  MountSpec as MountSpecContract,
  InvokeRequest as InvokeRequestContract,
  InvokeResult as InvokeResultContract,
  ChainLimits as ChainLimitsContract,
  InvokeContext as InvokeContextContract,
} from '@kb-labs/plugin-contracts';

/**
 * Session mount specification
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface MountSpec extends MountSpecContract {}

/**
 * Invoke request
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface InvokeRequest extends InvokeRequestContract {}

/**
 * Invoke result
 * @deprecated Import from @kb-labs/plugin-contracts instead
 * Extended to include ErrorEnvelope (runtime-specific)
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

/**
 * Chain limits for protection against infinite loops and resource exhaustion
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface ChainLimits extends ChainLimitsContract {}

/**
 * Invoke context tracking chain state
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface InvokeContext extends InvokeContextContract {}

