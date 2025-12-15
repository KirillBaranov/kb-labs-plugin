/**
 * @module @kb-labs/plugin-runtime/execute-plugin/adapters/types
 * Execution adapter interface for multi-protocol handler support
 *
 * @see ADR-0015: Execution Adapters Architecture
 */

import type { ExecutePluginOptions } from '../types.js';
import type { PluginContextV2 } from '../../context/plugin-context-v2.js';

/**
 * Supported execution types
 */
export type ExecutionType = 'cli' | 'job' | 'rest' | 'event';

/**
 * Execution adapter interface
 *
 * Each adapter knows how to:
 * 1. Prepare input from generic ExecutePluginOptions
 * 2. Invoke handler with correct signature
 * 3. Normalize output to unified format
 *
 * @template TInput - Handler-specific input type
 * @template TOutput - Handler output type
 */
export interface ExecutionAdapter<TInput = unknown, TOutput = unknown> {
  /** Adapter type identifier */
  readonly type: ExecutionType;

  /**
   * Prepare handler-specific input from generic options
   *
   * @param options - Generic execute plugin options
   * @returns Handler-specific input
   */
  prepareInput(options: ExecutePluginOptions): TInput;

  /**
   * Invoke handler with correct signature
   *
   * @param handler - Loaded handler function
   * @param input - Prepared input from prepareInput()
   * @param context - Plugin context
   * @returns Handler result
   */
  invoke(
    handler: Function,
    input: TInput,
    context: PluginContextV2
  ): Promise<TOutput>;

  /**
   * Normalize output to unified result format
   *
   * @param output - Raw handler output
   * @returns Normalized result with ok flag
   */
  normalizeOutput(output: TOutput): { ok: boolean; data?: unknown };
}

/**
 * CLI adapter input type
 */
export interface CliAdapterInput {
  argv: string[];
  flags: Record<string, unknown>;
}

/**
 * Job adapter input type (matches JobInput from shared-command-kit)
 */
export interface JobAdapterInput {
  jobId: string;
  executedAt: Date;
  runCount: number;
}

/**
 * REST adapter input type
 */
export interface RestAdapterInput {
  /** HTTP request body/query params */
  request: Record<string, unknown>;
  /** REST handler context */
  ctx: {
    requestId: string;
    pluginId: string;
    outdir?: string;
    traceId?: string;
    runtime?: {
      fetch: typeof fetch;
      fs: any;
      env: (key: string) => string | undefined;
      log: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
    };
  };
}
