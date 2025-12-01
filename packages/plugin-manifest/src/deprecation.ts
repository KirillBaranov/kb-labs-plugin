/**
 * @module @kb-labs/plugin-manifest/deprecation
 * Deprecation rules and warnings for v1 manifests
 */

/**
 * Deprecation dates for Manifest v1
 */
export const DEPRECATION_DATES = {
  /** Date when v1 was declared deprecated */
  DEPRECATED_DATE: '2025-01-01',
  /** Date when v1 support will be removed */
  REMOVAL_DATE: '2026-01-01',
} as const;

/**
 * Feature flag to allow v1 plugins
 */
export function isV1Allowed(): boolean {
  return (
    process.env.KB_ALLOW_V1_PLUGINS === 'true' ||
    process.env.KB_ALLOW_V1_PLUGINS === '1'
  );
}

/**
 * Generate deprecation warning message
 */
export function getDeprecationWarning(packageName: string): string {
  return `⚠️  Manifest v1 is deprecated (deprecated: ${DEPRECATION_DATES.DEPRECATED_DATE}, removal: ${DEPRECATION_DATES.REMOVAL_DATE}). Plugin ${packageName} should migrate to Manifest v2. Use migrateV1ToV2() to convert.`;
}

/**
 * Check if v1 should be used (for CI/legacy support)
 */
export function shouldUseV1(packageName: string): boolean {
  if (isV1Allowed()) {
    return true;
  }

  // In CI, allow v1 if flag is set
  if (process.env.CI && isV1Allowed()) {
    return true;
  }

  return false;
}
