/**
 * @module @kb-labs/plugin-runtime/execute-plugin/adapters/cli-adapter
 * CLI execution adapter - preserves existing handler(ctx, argv, flags) signature
 */

import type { ExecutionAdapter, CliAdapterInput } from './types.js';
import type { ExecutePluginOptions } from '../types.js';
import type { PluginContextV2 } from '../../context/plugin-context-v2.js';

/**
 * CLI adapter
 *
 * Handler signature: (ctx: PluginContextV2, argv: string[], flags: Record<string, unknown>) => Promise<unknown>
 *
 * This is the default adapter that preserves backward compatibility with existing CLI commands.
 */
export const cliAdapter: ExecutionAdapter<CliAdapterInput, unknown> = {
  type: 'cli',

  prepareInput(options: ExecutePluginOptions): CliAdapterInput {
    return {
      argv: options.argv,
      flags: options.flags,
    };
  },

  async invoke(
    handler: Function,
    input: CliAdapterInput,
    context: PluginContextV2
  ): Promise<unknown> {
    // CLI signature: handler(ctx, argv, flags)
    return handler(context, input.argv, input.flags);
  },

  normalizeOutput(output: unknown): { ok: boolean; data?: unknown } {
    // CLI handlers may return various things, assume success if no error thrown
    return { ok: true, data: output };
  },
};
