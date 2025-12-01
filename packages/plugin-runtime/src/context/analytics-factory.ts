/**
 * @module @kb-labs/plugin-runtime/context/analytics-factory
 * Create analytics emitter for execution context
 */

import type { ExecutionContext } from '../types';
import type { TelemetryEvent, TelemetryEmitResult } from '@kb-labs/core-types';
import { getTelemetryEmitter } from '../analytics';

/**
 * Create analytics emitter for injection into context.
 * Plugins receive a fire-and-forget helper that never throws.
 */
export function createAnalyticsEmitter(
  ctx: ExecutionContext,
): (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult> {
  const emitter = getTelemetryEmitter();
  
  return async (event: Partial<TelemetryEvent>): Promise<TelemetryEmitResult> => {
    const payload: Partial<TelemetryEvent> = {
      ...event,
      runId: event.runId ?? ctx.requestId,
      actor:
        event.actor ??
        {
          type: 'agent',
          id: ctx.pluginId,
          name: ctx.pluginId,
        },
      ctx: {
        ...(event.ctx ?? {}),
        workspace: ctx.workdir,
        command: ctx.routeOrCommand,
      },
    };

    try {
      return await emitter.emit(payload);
    } catch (error) {
      return {
        queued: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

