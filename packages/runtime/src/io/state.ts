/**
 * @module @kb-labs/plugin-runtime/io/state
 * State broker wrapper with permission checks
 */

import type { PermissionSpec } from '@kb-labs/plugin-manifest';
import type { StateBroker } from '@kb-labs/state-broker';
import { checkStatePermission } from '../permissions.js';

export interface StateRuntimeAPI {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(pattern?: string): Promise<void>;
}

/**
 * Create state runtime API with permission checks
 * Keys are automatically prefixed with namespace
 */
export function createStateAPI(
  broker: StateBroker,
  pluginId: string,
  permissions: PermissionSpec['state']
): StateRuntimeAPI {
  // Extract namespace from pluginId (e.g., '@kb-labs/mind-plugin' -> 'mind')
  const ownNamespace = pluginId.replace('@kb-labs/', '').replace(/-plugin$/, '');

  /**
   * Parse key into namespace and actual key
   * Formats:
   * - 'mykey' -> own namespace
   * - 'namespace:key' -> external namespace
   */
  function parseKey(key: string): { namespace: string; actualKey: string } {
    const colonIndex = key.indexOf(':');
    if (colonIndex === -1) {
      // No namespace prefix, use own namespace
      return { namespace: ownNamespace, actualKey: key };
    }
    // Has namespace prefix
    const namespace = key.slice(0, colonIndex);
    const actualKey = key.slice(colonIndex + 1);
    return { namespace, actualKey };
  }

  /**
   * Build full key with namespace prefix
   */
  function buildFullKey(namespace: string, actualKey: string): string {
    return `${namespace}:${actualKey}`;
  }

  /**
   * Check permission for operation
   */
  function checkPermission(
    namespace: string,
    operation: 'read' | 'write' | 'delete'
  ): void {
    const result = checkStatePermission(permissions, namespace, operation, pluginId);
    if (!result.granted) {
      const error = new Error(result.reason || 'Permission denied');
      (error as any).code = 'E_STATE_PERMISSION_DENIED';
      (error as any).details = result.details;
      throw error;
    }
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      const { namespace, actualKey } = parseKey(key);
      checkPermission(namespace, 'read');
      const fullKey = buildFullKey(namespace, actualKey);
      return broker.get<T>(fullKey);
    },

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
      const { namespace, actualKey } = parseKey(key);
      checkPermission(namespace, 'write');
      const fullKey = buildFullKey(namespace, actualKey);
      return broker.set(fullKey, value, ttl);
    },

    async delete(key: string): Promise<void> {
      const { namespace, actualKey } = parseKey(key);
      checkPermission(namespace, 'delete');
      const fullKey = buildFullKey(namespace, actualKey);
      return broker.delete(fullKey);
    },

    async clear(pattern?: string): Promise<void> {
      if (!pattern) {
        // Clearing all keys - only allowed for own namespace
        checkPermission(ownNamespace, 'delete');
        const fullPattern = `${ownNamespace}:*`;
        return broker.clear(fullPattern);
      }

      // Parse pattern to determine namespace
      const { namespace, actualKey } = parseKey(pattern);
      checkPermission(namespace, 'delete');
      const fullPattern = buildFullKey(namespace, actualKey);
      return broker.clear(fullPattern);
    },
  };
}
