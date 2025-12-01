/**
 * @module @kb-labs/plugin-runtime/capabilities
 * Capability broker and validation
 */

import { ErrorCode } from '@kb-labs/rest-api-contracts';

/**
 * Capability check result
 */
export interface CapabilityCheckResult {
  granted: boolean;
  missing: string[];
  grantedCapabilities: string[];
}

/**
 * Check if required capabilities are granted
 * Deny by default policy: all required capabilities must be present
 */
export function checkCapabilities(
  required: string[],
  granted: string[]
): CapabilityCheckResult {
  if (required.length === 0) {
    return {
      granted: true,
      missing: [],
      grantedCapabilities: [],
    };
  }

  const grantedSet = new Set(granted);
  const missing = required.filter((cap) => !grantedSet.has(cap));

  return {
    granted: missing.length === 0,
    missing,
    grantedCapabilities: required.filter((cap) => grantedSet.has(cap)),
  };
}

/**
 * Capability registry for known capabilities
 * This allows validation of capability names
 */
export const KNOWN_CAPABILITIES = [
  'kv.read',
  'kv.write',
  'blob.read',
  'blob.write',
  'http.fetch',
  'fs.read',
  'fs.write',
  'db.query',
  'db.write',
] as const;

export type KnownCapability = (typeof KNOWN_CAPABILITIES)[number];

/**
 * Validate capability names against known capabilities
 * Returns unknown capabilities (warnings, not errors)
 */
export function validateCapabilityNames(
  capabilities: string[]
): { unknown: string[] } {
  const knownSet = new Set(KNOWN_CAPABILITIES);
  const unknown = capabilities.filter((cap) => !knownSet.has(cap as KnownCapability));

  return { unknown };
}
