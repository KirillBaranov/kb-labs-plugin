/**
 * @module @kb-labs/plugin-runtime/analytics-stub
 * Temporary stub for analytics until platform integration is complete
 */

/**
 * No-op analytics stub.
 * TODO: Replace all usages with platform.analytics.track()
 */
export async function emitAnalyticsEvent(
  _event: string,
  _data: Record<string, unknown>
): Promise<void> {
  // No-op - analytics disabled until platform integration
}
