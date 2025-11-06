/**
 * @module @kb-labs/plugin-adapter-studio/components
 * Component resolution and dynamic imports
 */

import type { StudioRegistryEntry } from './registry.js';
import { resolveComponentPath } from './widgets.js';

/**
 * Resolved component info
 */
export interface ResolvedComponent {
  /** Component path */
  path: string;
  /** Whether it's a default component */
  isDefault: boolean;
  /** Import promise for dynamic loading */
  importPromise?: Promise<any>;
}

/**
 * Resolve component for widget
 */
export async function resolveComponent(
  widget: StudioRegistryEntry
): Promise<ResolvedComponent> {
  const path = resolveComponentPath(widget);
  const isDefault = widget.kind !== 'custom';

  return {
    path,
    isDefault,
  };
}

/**
 * Dynamic import component by path
 */
export async function loadComponent(
  componentPath: string,
  baseUrl?: string
): Promise<any> {
  try {
    // If absolute URL, use as-is
    if (componentPath.startsWith('http://') || componentPath.startsWith('https://')) {
      const module = await import(componentPath);
      return module.default || module;
    }

    // If relative path, resolve relative to baseUrl or current module
    const resolvedPath = componentPath.startsWith('.')
      ? new URL(componentPath, baseUrl ? `file://${baseUrl}/` : import.meta.url).pathname
      : componentPath;

    const module = await import(resolvedPath);
    return module.default || module;
  } catch (error) {
    throw new Error(
      `Failed to load component from ${componentPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Component loader with caching
 */
const componentCache = new Map<string, Promise<any>>();

export async function loadComponentCached(
  componentPath: string,
  baseUrl?: string
): Promise<any> {
  const cacheKey = `${baseUrl || ''}:${componentPath}`;

  if (!componentCache.has(cacheKey)) {
    componentCache.set(cacheKey, loadComponent(componentPath, baseUrl));
  }

  return componentCache.get(cacheKey)!;
}

/**
 * Clear component cache
 */
export function clearComponentCache(): void {
  componentCache.clear();
}
