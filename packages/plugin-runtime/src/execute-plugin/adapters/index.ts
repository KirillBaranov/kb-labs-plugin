/**
 * @module @kb-labs/plugin-runtime/execute-plugin/adapters
 * Execution adapters registry
 *
 * @see ADR-0015: Execution Adapters Architecture
 */

export type { ExecutionType, ExecutionAdapter, CliAdapterInput, JobAdapterInput, RestAdapterInput } from './types.js';

import type { ExecutionType, ExecutionAdapter } from './types.js';
import { cliAdapter } from './cli-adapter.js';
import { jobAdapter } from './job-adapter.js';
import { restAdapter } from './rest-adapter.js';

/**
 * Adapter registry
 */
const adapters: Record<ExecutionType, ExecutionAdapter> = {
  cli: cliAdapter,
  job: jobAdapter,
  rest: restAdapter,
  event: cliAdapter, // placeholder - use CLI adapter until event adapter is implemented
};

/**
 * Get adapter by execution type
 *
 * @param type - Execution type (cli, job, rest, event)
 * @returns Execution adapter for the specified type
 * @throws Error if adapter not found
 */
export function getAdapter(type: ExecutionType): ExecutionAdapter {
  const adapter = adapters[type];
  if (!adapter) {
    throw new Error(`Unknown execution type: ${type}. Available: ${Object.keys(adapters).join(', ')}`);
  }
  return adapter;
}

/**
 * Register a custom adapter
 *
 * @param type - Execution type
 * @param adapter - Adapter implementation
 */
export function registerAdapter(type: ExecutionType, adapter: ExecutionAdapter): void {
  adapters[type] = adapter;
}

// Re-export individual adapters for direct access
export { cliAdapter } from './cli-adapter.js';
export { jobAdapter } from './job-adapter.js';
export { restAdapter } from './rest-adapter.js';
