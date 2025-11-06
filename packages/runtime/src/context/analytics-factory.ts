/**
 * @module @kb-labs/plugin-runtime/context/analytics-factory
 * Create analytics emitter for execution context
 */

import type { ExecutionContext } from '../types.js';
import { emit } from '@kb-labs/analytics-sdk-node';
import type { AnalyticsEventV1, EmitResult } from '@kb-labs/analytics-sdk-node';

/**
 * Create analytics emitter for injection into context
 * This allows plugins to track custom events scoped to this execution
 */
export function createAnalyticsEmitter(
  ctx: ExecutionContext
): (event: Partial<AnalyticsEventV1>) => Promise<EmitResult> {
  return async (event: Partial<AnalyticsEventV1>): Promise<EmitResult> => {
    try {
      // Use analytics SDK emit with execution context
      return await emit({
        ...event,
        runId: ctx.requestId,
        actor: event.actor || {
          type: 'agent',
          id: ctx.pluginId,
          name: ctx.pluginId,
        },
        ctx: {
          ...event.ctx,
          workspace: ctx.workdir,
          command: ctx.routeOrCommand,
        },
      });
    } catch (error) {
      // Never throw - analytics failures should not break execution
      return { queued: false, reason: error instanceof Error ? error.message : String(error) };
    }
  };
}

