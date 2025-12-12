/**
 * @module @kb-labs/plugin-runtime/execute-plugin/capabilities
 * Capability checking for plugin execution
 */

/**
 * Check if plugin has required capabilities
 */
export function checkCapabilities(
  required: string[],
  granted: string[]
): { granted: boolean; missing: string[] } {
  if (required.length === 0) {
    return { granted: true, missing: [] };
  }

  const missing = required.filter(cap => !granted.includes(cap));

  return {
    granted: missing.length === 0,
    missing,
  };
}
