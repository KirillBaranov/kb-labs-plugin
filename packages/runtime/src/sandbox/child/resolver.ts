/**
 * @module @kb-labs/plugin-runtime/sandbox/child/resolver
 * Safe module resolver - restricts imports to allowed modules only
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Allowed built-in modules (safe subset)
 */
const ALLOWED_BUILTINS = new Set([
  'node:path',
  'node:url',
  'node:buffer',
  'node:util',
  'node:crypto', // Optional - may be needed for some plugins
  'node:stream',
  'node:events',
]);

/**
 * Allowed user packages (shimmed modules)
 */
const ALLOWED_USER_PACKAGES = new Set([
  '@kb-labs/runtime-net',
  '@kb-labs/runtime-fs',
]);

/**
 * Banned modules (security risk)
 */
const BANNED_MODULES = new Set([
  'child_process',
  'worker_threads',
  'vm',
  'inspector',
  'module',
  'fs', // Use shimmed version instead
  'http',
  'https',
  'net',
  'dns',
  'tls',
  'cluster',
]);

/**
 * Resolve module specifier safely
 * @param specifier - Module specifier (e.g., './handler.js', 'node:path', 'fs')
 * @param from - Current file path (for relative resolution)
 * @param pluginRoot - Plugin root directory (must be absolute)
 * @returns Resolved path or specifier
 * @throws Error if module is not allowed
 */
export function safeResolve(
  specifier: string,
  from: string,
  pluginRoot: string
): string {
  // Handle built-in modules
  if (specifier.startsWith('node:')) {
    if (!ALLOWED_BUILTINS.has(specifier)) {
      throw new Error(`Built-in module not allowed: ${specifier}`);
    }
    return specifier;
  }

  // Handle banned modules (including without node: prefix)
  if (BANNED_MODULES.has(specifier) || BANNED_MODULES.has(`node:${specifier}`)) {
    throw new Error(`Module not allowed: ${specifier}`);
  }

  // Handle allowed user packages
  if (ALLOWED_USER_PACKAGES.has(specifier)) {
    return specifier;
  }

  // Handle relative imports (must be within pluginRoot)
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const fromDir = path.dirname(from);
    const resolved = path.resolve(fromDir, specifier);

    // Normalize paths for comparison
    const normalizedResolved = path.normalize(resolved);
    const normalizedPluginRoot = path.normalize(pluginRoot);

    if (!normalizedResolved.startsWith(normalizedPluginRoot)) {
      throw new Error(
        `Path traversal attempt: ${specifier} resolves to ${resolved} outside plugin root ${pluginRoot}`
      );
    }

    return resolved;
  }

  // Absolute paths (should not be used, but check anyway)
  if (path.isAbsolute(specifier)) {
    const normalizedSpecifier = path.normalize(specifier);
    const normalizedPluginRoot = path.normalize(pluginRoot);

    if (!normalizedSpecifier.startsWith(normalizedPluginRoot)) {
      throw new Error(
        `Absolute path outside plugin root: ${specifier} (root: ${pluginRoot})`
      );
    }

    return normalizedSpecifier;
  }

  // External package (not allowed unless in whitelist)
  throw new Error(
    `External module not allowed: ${specifier}. Only relative imports within plugin root are allowed.`
  );
}

/**
 * Get plugin root from current file location
 * This assumes the bootstrap is in src/sandbox/child/bootstrap.ts
 */
export function getPluginRoot(): string {
  // This will be set by the parent process via environment variable
  const pluginRoot = process.env.PLUGIN_ROOT;
  if (!pluginRoot) {
    throw new Error('PLUGIN_ROOT environment variable not set');
  }
  return path.resolve(pluginRoot);
}

