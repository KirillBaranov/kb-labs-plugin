/**
 * @module @kb-labs/plugin-runtime/analytics/emitter
 * Analytics emitter interface and default helper.
 */

import type { TelemetryEmitResult } from '@kb-labs/core-types';

export interface AnalyticsEmitOptions {
  /**
   * Optional correlation identifier. Hosts may use this to bind analytics to
   * workflow runs, HTTP requests, etc.
   */
  correlationId?: string;
  /**
   * Optional target channel or namespace (e.g. metrics vs logs).
   */
  channel?: string;
}

export interface AnalyticsEmitter {
  /**
   * Emit a metric or analytics event.
   */
  emit(metric: string, payload: Record<string, unknown>, options?: AnalyticsEmitOptions): Promise<TelemetryEmitResult>;
  /**
   * Flush any buffered telemetry. Optional.
   */
  flush?(): Promise<void>;
}

class NoopAnalyticsEmitter implements AnalyticsEmitter {
  async emit(): Promise<TelemetryEmitResult> {
    return { queued: false, reason: 'noop' };
  }

  async flush(): Promise<void> {
    // intentionally empty
  }
}

const noopAnalyticsEmitterInstance = new NoopAnalyticsEmitter();

export function createNoopAnalyticsEmitter(): AnalyticsEmitter {
  return noopAnalyticsEmitterInstance;
}

