/**
 * @module @kb-labs/plugin-runtime/execute-plugin/adapters/job-adapter
 * Job execution adapter - handler(input: JobInput, ctx: PluginContext) signature
 */

import type { ExecutionAdapter, JobAdapterInput } from './types.js';
import type { ExecutePluginOptions } from '../types.js';
import type { PluginContextV2 } from '../../context/plugin-context-v2.js';

/**
 * Job result type
 */
interface JobResult {
  ok: boolean;
  [key: string]: unknown;
}

/**
 * Job adapter
 *
 * Handler signature: (input: JobInput, ctx: PluginHandlerContext) => Promise<JobResult>
 *
 * JobInput contains: { jobId, executedAt: Date, runCount }
 */
export const jobAdapter: ExecutionAdapter<JobAdapterInput, JobResult> = {
  type: 'job',

  prepareInput(options: ExecutePluginOptions): JobAdapterInput {
    const { flags } = options;

    // Parse executedAt from ISO string or timestamp
    let executedAt: Date;
    if (flags.executedAt instanceof Date) {
      executedAt = flags.executedAt;
    } else if (typeof flags.executedAt === 'string') {
      executedAt = new Date(flags.executedAt);
    } else if (typeof flags.executedAt === 'number') {
      executedAt = new Date(flags.executedAt);
    } else {
      executedAt = new Date(); // fallback to now
    }

    return {
      jobId: flags.jobId as string,
      executedAt,
      runCount: flags.runCount as number,
    };
  },

  async invoke(
    handler: Function,
    input: JobAdapterInput,
    context: PluginContextV2
  ): Promise<JobResult> {
    // Job signature: handler(input, ctx)
    // Note: ctx here is PluginHandlerContext which is compatible with PluginContextV2
    return handler(input, context);
  },

  normalizeOutput(output: JobResult): { ok: boolean; data?: unknown } {
    return {
      ok: output.ok,
      data: output,
    };
  },
};
