/**
 * @module @kb-labs/plugin-runtime/invoke/transform-loader
 * Utility to load custom header transform functions from plugin modules.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type HeaderTransformFn = (value: string) => string | Promise<string>;

const transformCache = new Map<string, Promise<HeaderTransformFn>>();

function normalizeModulePath(pluginRoot: string, modulePath: string): string {
  if (!modulePath) {
    throw new Error('Header transform module path cannot be empty');
  }
  if (modulePath.startsWith('.') || modulePath.startsWith('/')) {
    return path.resolve(pluginRoot, modulePath);
  }
  // Treat bare specifier as relative to plugin root
  return path.resolve(pluginRoot, modulePath);
}

export async function loadCustomHeaderTransform(
  pluginRoot: string,
  modulePath: string,
  exportName: string
): Promise<HeaderTransformFn> {
  const resolvedModule = normalizeModulePath(pluginRoot, modulePath);
  const cacheKey = `${resolvedModule}#${exportName}`;

  if (!transformCache.has(cacheKey)) {
    transformCache.set(
      cacheKey,
      (async () => {
        const moduleUrl = pathToFileURL(resolvedModule).href;
        const imported = await import(moduleUrl);
        const candidate = imported?.[exportName];
        if (typeof candidate !== 'function') {
          throw new Error(
            `Header transform export "${exportName}" in "${modulePath}" is not a function`
          );
        }
        return candidate as HeaderTransformFn;
      })()
    );
  }

  return transformCache.get(cacheKey)!;
}

export function clearHeaderTransformCache(): void {
  transformCache.clear();
}

