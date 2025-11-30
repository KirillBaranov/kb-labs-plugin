/**
 * @module @kb-labs/plugin-contracts/invoke
 * Invoke API type definitions with versioning support
 */

export * from './v1';

// Import v1 types for re-export with current version names
import type {
  MountSpecV1,
  InvokeRequestV1,
  InvokeResultV1,
  ChainLimitsV1,
  InvokeContextV1,
  InvokeApiV1,
} from './v1';

// Export current version as default (for convenience)
// When v2 is introduced, this will be updated
export type MountSpec = MountSpecV1;
export type InvokeRequest = InvokeRequestV1;
export type InvokeResult<T = unknown> = InvokeResultV1<T>;
export type ChainLimits = ChainLimitsV1;
export type InvokeContext = InvokeContextV1;
export type InvokeApi = InvokeApiV1;

