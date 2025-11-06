/**
 * @module @kb-labs/plugin-runtime/invoke/permissions
 * Permission resolution for cross-plugin invocation
 */

import type { InvokePermission } from '@kb-labs/plugin-manifest';

/**
 * Target specification for permission check
 */
export interface InvokeTarget {
  pluginId: string;
  method: string;
  path: string;
}

/**
 * Permission check result
 */
export interface InvokePermissionResult {
  allow: boolean;
  reason?: string;
  remediation?: string;
}

/**
 * Check if a deny pattern matches the target
 */
function matchesDenyPattern(denyPattern: string, target: InvokeTarget): boolean {
  const pattern = `${target.pluginId}:${target.method} ${target.path}`;
  const wildcardPattern = `${target.pluginId}:*`;
  
  return denyPattern === pattern || denyPattern === wildcardPattern;
}

/**
 * Resolve invoke permission decision
 * Priority: DENY (explicit) → routes allow → plugins allow → default DENY
 */
export function resolveInvokeDecision(
  perms: InvokePermission | undefined,
  target: InvokeTarget
): InvokePermissionResult {
  // Default deny if no permissions
  if (!perms) {
    return {
      allow: false,
      reason: 'default deny',
      remediation: 'Add target to permissions.invoke in caller manifest',
    };
  }

  // 1. Explicit deny wins - highest priority
  if (perms.deny && perms.deny.length > 0) {
    for (const deny of perms.deny) {
      if (matchesDenyPattern(deny.target, target)) {
        return {
          allow: false,
          reason: 'explicit deny',
          remediation: `Remove '${deny.target}' from permissions.invoke.deny to allow this target`,
        };
      }
    }
  }

  // 2. Routes allow (if specified) - exact match
  if (perms.routes && perms.routes.length > 0) {
    const targetPattern = `${target.pluginId}:${target.method} ${target.path}`;
    const allowed = perms.routes.some((r) => r.target === targetPattern);
    
    if (allowed) {
      return { allow: true };
    }
    
    return {
      allow: false,
      reason: 'route not allowed',
      remediation: `Add '${targetPattern}' to permissions.invoke.routes in caller manifest`,
    };
  }

  // 3. Plugins allow (if specified)
  if (perms.plugins && perms.plugins.length > 0) {
    const allowed = perms.plugins.includes(target.pluginId);
    
    if (allowed) {
      return { allow: true };
    }
    
    return {
      allow: false,
      reason: 'plugin not allowed',
      remediation: `Add '${target.pluginId}' to permissions.invoke.plugins in caller manifest`,
    };
  }

  // 4. Default deny - lowest priority
  return {
    allow: false,
    reason: 'default deny',
    remediation: 'Add target to permissions.invoke in caller manifest',
  };
}

