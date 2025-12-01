/**
 * @module @kb-labs/plugin-runtime/validation
 * Manifest validation on startup
 */

import type { ManifestV2, RestRouteDecl, CliCommandDecl } from '@kb-labs/plugin-manifest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate manifest on startup
 * @param manifest - Plugin manifest
 * @param manifestPath - Path to manifest file (for resolving handlers)
 * @returns Validation result
 */
export async function validateManifestOnStartup(
  manifest: ManifestV2,
  manifestPath: string
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const manifestDir = path.dirname(manifestPath);

  // 1. Check handler paths exist
  if (manifest.rest?.routes) {
    for (const route of manifest.rest.routes) {
      const handlerRef = route.handler;
      const [handlerFile, exportName] = handlerRef.split('#');
      
      if (!exportName || !handlerFile) {
        errors.push(
          `Route ${route.method} ${route.path}: Invalid handler reference "${handlerRef}" (must include export name)`
        );
        continue;
      }

      const handlerPath = path.resolve(manifestDir, handlerFile);
      try {
        await fs.access(handlerPath);
      } catch {
        errors.push(
          `Route ${route.method} ${route.path}: Handler file not found: ${handlerPath}`
        );
      }
    }
  }

  if (manifest.cli?.commands) {
    for (const command of manifest.cli.commands) {
      const handlerRef = command.handler;
      const [handlerFile, exportName] = handlerRef.split('#');
      
      if (!exportName || !handlerFile) {
        errors.push(
          `CLI command ${command.id}: Invalid handler reference "${handlerRef}" (must include export name)`
        );
        continue;
      }

      const handlerPath = path.resolve(manifestDir, handlerFile);
      try {
        await fs.access(handlerPath);
      } catch {
        errors.push(
          `CLI command ${command.id}: Handler file not found: ${handlerPath}`
        );
      }
    }
  }

  // 2. Check permission conflicts
  if (manifest.permissions) {
    const perms = manifest.permissions;

    // FS: mode conflicts
    if (perms.fs) {
      if (perms.fs.mode === 'none' && (perms.fs.allow?.length || 0) > 0) {
        warnings.push(
          'FS permissions: mode is "none" but allow patterns are specified (will be ignored)'
        );
      }
      if (perms.fs.mode === 'read' && (perms.fs.allow?.length || 0) > 0) {
        warnings.push(
          'FS permissions: mode is "read" but allow patterns may allow writes (verify patterns)'
        );
      }
    }

    // Net: conflicts between allowHosts and denyHosts
    if (perms.net && perms.net !== 'none') {
      const netPerms = perms.net;
      if (netPerms.allowHosts && netPerms.denyHosts) {
        const conflicts = netPerms.allowHosts.filter((host) =>
          netPerms.denyHosts?.includes(host)
        );
        if (conflicts.length > 0) {
          errors.push(
            `Network permissions: Hosts in both allowHosts and denyHosts: ${conflicts.join(', ')}`
          );
        }
      }
    }

    // Quotas: validate ranges
    if (perms.quotas) {
      if (perms.quotas.timeoutMs && perms.quotas.timeoutMs < 0) {
        errors.push('Quotas: timeoutMs must be positive');
      }
      if (perms.quotas.memoryMb && perms.quotas.memoryMb < 1) {
        errors.push('Quotas: memoryMb must be at least 1');
      }
      if (perms.quotas.cpuMs && perms.quotas.cpuMs < 0) {
        errors.push('Quotas: cpuMs must be positive');
      }
    }
  }

  // 3. Check capabilities
  if (manifest.capabilities && manifest.capabilities.length > 0) {
    // Warn about unknown capabilities (will be checked at runtime)
    const knownCapabilities = [
      'fs:read',
      'fs:write',
      'http.fetch',
      'artifacts.write',
      'kv.read',
      'kv.write',
    ];
    const unknown = manifest.capabilities.filter(
      (cap) => !knownCapabilities.some((known) => cap.includes(known))
    );
    if (unknown.length > 0) {
      warnings.push(
        `Unknown capabilities (may not be granted): ${unknown.join(', ')}`
      );
    }
  }

  // 4. Check artifact declarations
  if (manifest.artifacts) {
    for (const artifact of manifest.artifacts) {
      // Check path template has required placeholders
      if (!artifact.pathTemplate.includes('{runId}') && !artifact.pathTemplate.includes('{ts}')) {
        warnings.push(
          `Artifact ${artifact.id}: pathTemplate should include {runId} or {ts} for uniqueness`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

