/**
 * @module @kb-labs/plugin-runtime/deprecation
 * Runtime deprecation warnings for legacy APIs
 *
 * This module provides controlled deprecation warnings that:
 * - Only warn once per API per process (avoids spam)
 * - Can be silenced via environment variable
 * - Includes migration guidance
 */

/**
 * Track which deprecation warnings have already been shown
 */
const shownWarnings = new Set<string>();

/**
 * Check if deprecation warnings are enabled
 */
function isDeprecationEnabled(): boolean {
  // Allow silencing warnings via env var
  return process.env.KB_SUPPRESS_DEPRECATION_WARNINGS !== 'true';
}

/**
 * Emit a deprecation warning (once per API)
 *
 * @param api - The deprecated API name
 * @param replacement - The recommended replacement
 * @param additionalInfo - Optional additional context
 */
export function deprecate(
  api: string,
  replacement: string,
  additionalInfo?: string
): void {
  if (!isDeprecationEnabled()) {
    return;
  }

  // Only warn once per API
  if (shownWarnings.has(api)) {
    return;
  }

  shownWarnings.add(api);

  const warning = [
    `⚠️  [DEPRECATED] ${api} is deprecated and will be removed in v2.5`,
    `    → Use ${replacement} instead`,
    additionalInfo ? `    ${additionalInfo}` : null,
    `    To silence these warnings: KB_SUPPRESS_DEPRECATION_WARNINGS=true`,
    `    Migration guide: kb-labs-plugin/MIGRATION-GUIDE.md`
  ]
    .filter(Boolean)
    .join('\n');

  // Use console.warn to ensure it's visible even with logger overrides
  console.warn(warning);
}

/**
 * Create a deprecation-wrapped function
 *
 * @param api - The deprecated API name
 * @param replacement - The recommended replacement
 * @param fn - The original function
 * @returns Wrapped function that warns on first call
 */
export function deprecateFunction<T extends (...args: any[]) => any>(
  api: string,
  replacement: string,
  fn: T
): T {
  return ((...args: any[]) => {
    deprecate(api, replacement);
    return fn(...args);
  }) as T;
}

/**
 * Create a deprecation-wrapped object with Proxy
 *
 * Warns when any property is accessed for the first time
 *
 * @param api - The deprecated API name
 * @param replacement - The recommended replacement
 * @param obj - The original object
 * @returns Proxied object that warns on property access
 */
export function deprecateObject<T extends object>(
  api: string,
  replacement: string,
  obj: T
): T {
  return new Proxy(obj, {
    get(target, prop, receiver) {
      // Warn on first access to any method
      if (typeof prop === 'string' && !prop.startsWith('_')) {
        deprecate(`${api}.${prop}`, `${replacement}.${prop}`);
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

/**
 * Reset shown warnings (for testing)
 * @internal
 */
export function resetDeprecationWarnings(): void {
  shownWarnings.clear();
}
