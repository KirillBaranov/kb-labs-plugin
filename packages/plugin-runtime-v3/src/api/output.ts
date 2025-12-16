/**
 * Output API implementation
 */

import type { OutputAPI } from '@kb-labs/plugin-contracts-v3';

/**
 * Create OutputAPI for structured output
 */
export function createOutputAPI(): OutputAPI & { _getState(): { result: unknown; meta: Record<string, unknown> } } {
  let resultData: unknown = undefined;
  const metadata: Record<string, unknown> = {};

  return {
    result<T>(data: T): void {
      resultData = data;
    },

    meta(key: string, value: unknown): void {
      metadata[key] = value;
    },

    getResult<T>(): T | undefined {
      return resultData as T | undefined;
    },

    getMeta(): Record<string, unknown> {
      return { ...metadata };
    },

    // Internal method to get state
    _getState() {
      return {
        result: resultData,
        meta: metadata,
      };
    },
  };
}
