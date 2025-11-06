/**
 * @module @kb-labs/plugin-runtime/analytics
 * Analytics integration via @kb-labs/analytics-sdk-node
 */

import { emit } from '@kb-labs/analytics-sdk-node';
import type { AnalyticsEventV1 } from '@kb-labs/analytics-sdk-node';

/**
 * Emit analytics event
 */
export async function emitAnalyticsEvent(
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await emit({
      ...data,
      event,
      timestamp: new Date().toISOString(),
    } as any);
  } catch (error) {
    // Never throw - analytics failures should not break execution
    console.error(`[plugin-runtime] Failed to emit analytics event ${event}:`, error);
  }
}
