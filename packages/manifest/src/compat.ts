/**
 * @module @kb-labs/plugin-manifest/compat
 * Compatibility detection and version handling
 */

import type { ManifestV1, ManifestV2 } from './types.js';

/**
 * Detect manifest version
 */
export function detectManifestVersion(
  manifest: unknown
): 'v1' | 'v2' | 'unknown' {
  if (!manifest || typeof manifest !== 'object') {
    return 'unknown';
  }

  // Check for v2 schema
  if ('schema' in manifest && manifest.schema === 'kb.plugin/2') {
    return 'v2';
  }

  // Check for v1 manifestVersion
  if (
    'manifestVersion' in manifest &&
    manifest.manifestVersion === '1.0'
  ) {
    return 'v1';
  }

  // Check for v1 commands array pattern
  if ('commands' in manifest && Array.isArray(manifest.commands)) {
    const firstCommand = manifest.commands[0];
    if (
      firstCommand &&
      typeof firstCommand === 'object' &&
      'manifestVersion' in firstCommand &&
      firstCommand.manifestVersion === '1.0'
    ) {
      return 'v1';
    }
  }

  return 'unknown';
}

/**
 * Check if plugin has both v1 and v2 manifests
 */
export interface DualManifestCheck {
  hasV1: boolean;
  hasV2: boolean;
  pluginId?: string;
}

/**
 * Check for dual manifest registration
 * Returns warning message if both v1 and v2 are present
 */
export function checkDualManifest(
  v1Manifest: ManifestV1 | null,
  v2Manifest: ManifestV2 | null,
  packageName: string
): DualManifestCheck & { warning?: string } {
  const hasV1 = v1Manifest !== null;
  const hasV2 = v2Manifest !== null;

  let warning: string | undefined;

  if (hasV1 && hasV2) {
    warning = `Plugin ${packageName} has both v1 and v2 manifests. Preferring v2, ignoring v1.`;
  }

  return {
    hasV1,
    hasV2,
    pluginId: v2Manifest?.id || (v1Manifest?.commands[0]?.group || packageName),
    warning,
  };
}
