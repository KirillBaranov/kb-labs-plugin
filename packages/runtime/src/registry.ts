/**
 * @module @kb-labs/plugin-runtime/registry
 * Plugin registry for route resolution
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { HandlerRef } from './types.js';

/**
 * Plugin registry interface for runtime
 * Provides plugin lookup and route resolution
 */
export interface PluginRegistry {
  /**
   * Get manifest for a plugin
   * @param pluginId - Plugin identifier
   * @param version - Optional version constraint (semver range)
   * @returns Manifest or null if not found
   */
  getManifest(pluginId: string, version?: string): Promise<ManifestV2 | null>;

  /**
   * Resolve route to handler
   * @param pluginId - Plugin identifier
   * @param method - HTTP method (GET, POST, etc.)
   * @param path - Route path
   * @returns Handler reference or null if not found
   */
  resolveRoute(pluginId: string, method: string, path: string): Promise<HandlerRef | null>;
}

/**
 * Resolved route information
 */
export type ResolvedRoute = {
  pluginId: string;
  handler: HandlerRef;
  manifest: ManifestV2;
};
