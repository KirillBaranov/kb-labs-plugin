/**
 * @module @kb-labs/plugin-runtime/execute-plugin/adapters/rest-adapter
 * REST execution adapter - handler(request, ctx: RestHandlerContext) signature
 */

import type { ExecutionAdapter, RestAdapterInput } from './types.js';
import type { ExecutePluginOptions } from '../types.js';
import type { PluginContextV2 } from '../../context/plugin-context-v2.js';

/**
 * REST response type (from defineRestHandler)
 */
interface RestResponse {
  ok?: boolean;
  [key: string]: unknown;
}

/**
 * REST adapter
 *
 * Handler signature: (request: TInput, ctx: RestHandlerContext) => Promise<TOutput>
 *
 * REST handlers defined via defineRestHandler() expect:
 * - request: HTTP body/query params (validated via Zod schema)
 * - ctx: RestHandlerContext with requestId, pluginId, runtime helpers
 */
export const restAdapter: ExecutionAdapter<RestAdapterInput, RestResponse> = {
  type: 'rest',

  prepareInput(options: ExecutePluginOptions): RestAdapterInput {
    const { flags, context } = options;

    // Build RestHandlerContext from PluginContextV2
    return {
      request: flags, // HTTP body/query params passed as flags
      ctx: {
        requestId: context.requestId,
        pluginId: context.pluginId,
        outdir: context.outdir,
        traceId: context.metadata?.traceId as string | undefined,
        runtime: context.runtime ? {
          fetch: context.runtime.fetch,
          fs: context.runtime.fs,
          env: context.runtime.env,
          log: context.runtime.log,
        } : undefined,
      },
    };
  },

  async invoke(
    handler: Function,
    input: RestAdapterInput,
    _context: PluginContextV2
  ): Promise<RestResponse> {
    // REST signature: handler(request, ctx)
    return handler(input.request, input.ctx);
  },

  normalizeOutput(output: RestResponse): { ok: boolean; data?: unknown } {
    // REST handlers may return { ok: false, code, message } for errors
    // or just data for success
    const isOk = output.ok !== false;
    return {
      ok: isOk,
      data: output,
    };
  },
};
