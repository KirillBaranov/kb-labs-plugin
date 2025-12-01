/**
 * @module @kb-labs/plugin-runtime/analytics
 * Analytics integration via TelemetryEmitter abstraction
 */

import type { TelemetryEmitter, TelemetryEvent } from '@kb-labs/core-types';

// Global telemetry emitter (optional, can be set by host)
let globalTelemetryEmitter: TelemetryEmitter | null = null;

/**
 * Set global telemetry emitter (called by host application)
 */
export function setTelemetryEmitter(emitter: TelemetryEmitter | null): void {
  globalTelemetryEmitter = emitter;
}

/**
 * Get current telemetry emitter (returns no-op if not set)
 */
export function getTelemetryEmitter(): TelemetryEmitter {
  return globalTelemetryEmitter || createNoOpTelemetryEmitter();
}

/**
 * Create a no-op telemetry emitter
 */
function createNoOpTelemetryEmitter(): TelemetryEmitter {
  return {
    async emit(_event: Partial<TelemetryEvent>) {
      return { queued: false, reason: 'Telemetry disabled' };
    },
  };
}

/**
 * Emit analytics event
 */
export async function emitAnalyticsEvent(
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const emitter = getTelemetryEmitter();
  try {
    await emitter.emit({
      type: event,
      payload: data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // Never throw - analytics failures should not break execution
    console.error(`[plugin-runtime] Failed to emit analytics event ${event}:`, error);
  }
}
