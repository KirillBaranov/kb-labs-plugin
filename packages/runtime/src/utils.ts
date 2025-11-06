/**
 * @module @kb-labs/plugin-runtime/utils
 * Utility functions
 */

/**
 * Create request ID
 */
export function createId(): string {
  return `r-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Hash manifest for analytics (sha256 of normalized manifest)
 */
export async function hashManifest(manifest: unknown): Promise<string> {
  // For now, simple hash - in production, use crypto.createHash('sha256')
  const normalized = JSON.stringify(manifest, Object.keys(manifest as Record<string, unknown>).sort());
  return normalized.substring(0, 16); // Simplified hash
}
