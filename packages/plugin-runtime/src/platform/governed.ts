/**
 * Governed Platform Services
 *
 * Wraps raw platform services with permission checks.
 * Used in both devMode (in-process) and subprocess mode.
 */

import type {
  PlatformServices,
  PermissionSpec,
  Logger,
} from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';

/**
 * Check if cache key matches allowed namespaces
 */
function checkCacheNamespace(key: string, permission: string[] | boolean | undefined): void {
  if (permission === false || permission === undefined) {
    throw new PermissionError('Cache access denied');
  }

  if (permission === true) {
    return; // All namespaces allowed
  }

  // Check if key starts with any allowed namespace
  const allowed = permission as string[];
  const hasMatch = allowed.some((ns) => key.startsWith(`${ns}:`));

  if (!hasMatch) {
    throw new PermissionError(
      `Cache key '${key}' not allowed. Permitted namespaces: ${allowed.join(', ')}`
    );
  }
}

/**
 * Check if storage path is within allowed paths
 */
function checkStoragePath(path: string, permission: string[] | boolean | undefined): void {
  if (permission === false || permission === undefined) {
    throw new PermissionError('Storage access denied');
  }

  if (permission === true) {
    return; // All paths allowed
  }

  // Check if path starts with any allowed base path
  const allowed = permission as string[];
  const hasMatch = allowed.some((basePath) => path.startsWith(basePath));

  if (!hasMatch) {
    throw new PermissionError(
      `Storage path '${path}' not allowed. Permitted paths: ${allowed.join(', ')}`
    );
  }
}

/**
 * Create denied service stub
 */
function createDeniedService(serviceName: string): never {
  throw new PermissionError(`Platform service '${serviceName}' access denied`);
}

/**
 * Wrap raw platform services with permission checks.
 *
 * @param raw - Raw platform services from parent process
 * @param permissions - Plugin permissions spec
 * @param pluginId - Plugin ID for logger child context
 * @returns Governed platform services with permission enforcement
 */
export function createGovernedPlatformServices(
  raw: PlatformServices,
  permissions: PermissionSpec,
  pluginId: string
): PlatformServices {
  return {
    // Logger: always allowed, create child logger with plugin context
    logger: raw.logger.child({ plugin: pluginId }),

    // LLM: check permission
    llm: permissions.platform?.llm
      ? {
          chat: async (messages, options) => {
            // Optional: check model whitelist
            const allowedModels =
              typeof permissions.platform?.llm === 'object'
                ? (permissions.platform.llm as { models?: string[] }).models
                : undefined;

            if (allowedModels && options?.model && !allowedModels.includes(options.model)) {
              throw new PermissionError(
                `LLM model '${options.model}' not allowed. Permitted models: ${allowedModels.join(', ')}`
              );
            }

            return raw.llm.chat(messages, options);
          },
        }
      : (createDeniedService('llm') as any),

    // Embeddings: binary permission
    embeddings: permissions.platform?.embeddings
      ? raw.embeddings
      : (createDeniedService('embeddings') as any),

    // VectorStore: binary permission
    vectorStore: permissions.platform?.vectorStore
      ? raw.vectorStore
      : (createDeniedService('vectorStore') as any),

    // Cache: namespace-based permission
    cache: permissions.platform?.cache
      ? {
          get: async (key) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.get(key);
          },
          set: async (key, value, ttl) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.set(key, value, ttl);
          },
          delete: async (key) => {
            checkCacheNamespace(key, permissions.platform?.cache);
            return raw.cache.delete(key);
          },
          clear: async () => {
            if (permissions.platform?.cache !== true) {
              throw new PermissionError('Cache.clear() requires full cache permission');
            }
            return raw.cache.clear();
          },
        }
      : (createDeniedService('cache') as any),

    // Storage: path-based permission
    storage: permissions.platform?.storage
      ? {
          read: async (path) => {
            checkStoragePath(path, permissions.platform?.storage);
            return raw.storage.read(path);
          },
          write: async (path, data) => {
            checkStoragePath(path, permissions.platform?.storage);
            return raw.storage.write(path, data);
          },
          delete: async (path) => {
            checkStoragePath(path, permissions.platform?.storage);
            return raw.storage.delete(path);
          },
          exists: async (path) => {
            checkStoragePath(path, permissions.platform?.storage);
            return raw.storage.exists(path);
          },
          list: async (prefix) => {
            checkStoragePath(prefix, permissions.platform?.storage);
            return raw.storage.list(prefix);
          },
        }
      : (createDeniedService('storage') as any),

    // Analytics: binary permission
    analytics: permissions.platform?.analytics
      ? raw.analytics
      : (createDeniedService('analytics') as any),
  };
}
