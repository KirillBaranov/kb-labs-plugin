/**
 * @module @kb-labs/plugin-runtime/validation/platform-requirements
 * Platform requirements validation for plugins.
 */

import type { PlatformRequirements, PlatformServiceId } from '@kb-labs/plugin-manifest';

/**
 * Platform requirements validation result.
 */
export interface PlatformValidationResult {
  /** Whether all required services are available */
  valid: boolean;
  /** Missing required services */
  missingRequired: PlatformServiceId[];
  /** Missing optional services (for warnings) */
  missingOptional: PlatformServiceId[];
}

/**
 * Validate plugin platform requirements against configured services.
 *
 * @param requirements - Plugin's platform requirements from manifest
 * @param configuredServices - Set of service IDs that are configured
 * @returns Validation result
 *
 * @example
 * ```typescript
 * import { platform } from '@kb-labs/core-runtime';
 *
 * const result = validatePlatformRequirements(
 *   manifest.platform,
 *   platform.getConfiguredServices()
 * );
 *
 * if (!result.valid) {
 *   throw new Error(`Missing services: ${result.missingRequired.join(', ')}`);
 * }
 * ```
 */
export function validatePlatformRequirements(
  requirements: PlatformRequirements | undefined,
  configuredServices: Set<string>
): PlatformValidationResult {
  // No requirements = always valid
  if (!requirements) {
    return {
      valid: true,
      missingRequired: [],
      missingOptional: [],
    };
  }

  const missingRequired: PlatformServiceId[] = [];
  const missingOptional: PlatformServiceId[] = [];

  // Check required services
  if (requirements.requires) {
    for (const service of requirements.requires) {
      if (!configuredServices.has(service)) {
        missingRequired.push(service);
      }
    }
  }

  // Check optional services (for warnings only)
  if (requirements.optional) {
    for (const service of requirements.optional) {
      if (!configuredServices.has(service)) {
        missingOptional.push(service);
      }
    }
  }

  return {
    valid: missingRequired.length === 0,
    missingRequired,
    missingOptional,
  };
}

/**
 * Format platform validation error message.
 */
export function formatPlatformValidationError(
  pluginId: string,
  missingServices: PlatformServiceId[]
): string {
  const serviceList = missingServices
    .map((s) => `  - ${s}`)
    .join('\n');

  return `Plugin "${pluginId}" requires platform services that are not configured:\n${serviceList}\n\nConfigure these services in kb.config.json or remove them from the plugin's platform.requires.`;
}

/**
 * Format platform validation warning message.
 */
export function formatPlatformValidationWarning(
  pluginId: string,
  missingServices: PlatformServiceId[]
): string {
  const serviceList = missingServices
    .map((s) => `  - ${s}`)
    .join('\n');

  return `Plugin "${pluginId}" has optional platform services that are not configured:\n${serviceList}\n\nSome features may be degraded or unavailable.`;
}
