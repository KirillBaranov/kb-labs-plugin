/**
 * @module @kb-labs/plugin-runtime/permissions
 * Permission validation and checks with allow/deny lists
 */

import type { PermissionSpec } from '@kb-labs/plugin-manifest';
import { ErrorCode } from '@kb-labs/api-contracts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { minimatch } from 'minimatch';

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  granted: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

/**
 * Check if IP address is in CIDR block
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const parts = cidr.split('/');
  const network = parts[0];
  const prefixLengthStr = parts[1];
  
  if (!network) {
    return false;
  }
  
  const prefixLength = parseInt(prefixLengthStr || '32', 10);

  const ipToNumber = (ip: string): number => {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return 0;
    const [a, b, c, d] = parts;
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      return 0;
    }
    return (
      a * 256 ** 3 +
      b * 256 ** 2 +
      c * 256 +
      d
    );
  };

  const networkNum = ipToNumber(network);
  const ipNum = ipToNumber(ip);
  const mask = ~(2 ** (32 - prefixLength) - 1);

  return (networkNum & mask) === (ipNum & mask);
}

/**
 * FS permission check with allow/deny glob patterns
 */
export async function checkFsPermission(
  permission: PermissionSpec['fs'],
  targetPath: string
): Promise<PermissionCheckResult> {
  if (!permission) {
    return {
      granted: false,
      reason: 'FS access not permitted (no fs permission)',
    };
  }

  if (permission.mode === 'none') {
    return {
      granted: false,
      reason: 'FS access not permitted (fs.mode: none)',
    };
  }

  // Normalize path
  const normalized = path.normalize(targetPath);

  // Check deny patterns first (deny takes precedence)
  if (permission.deny && permission.deny.length > 0) {
    if (
      permission.deny.some((pattern) =>
        minimatch(normalized, pattern, { dot: true })
      )
    ) {
      return {
        granted: false,
        reason: `FS access denied: path ${targetPath} matches deny pattern`,
        details: { targetPath, denyPatterns: permission.deny },
      };
    }
  }

  // Check allow patterns
  if (permission.allow && permission.allow.length > 0) {
    if (
      !permission.allow.some((pattern) =>
        minimatch(normalized, pattern, { dot: true })
      )
    ) {
      return {
        granted: false,
        reason: `FS access denied: path ${targetPath} does not match any allow pattern`,
        details: { targetPath, allowPatterns: permission.allow },
      };
    }
  }

  // If no allow patterns, mode determines access
  try {
    await fs.access(targetPath);
    return { granted: true };
  } catch (error) {
    return {
      granted: false,
      reason: `FS access failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { targetPath },
    };
  }
}

/**
 * Network permission check with allow/deny hosts and CIDR
 */
export function checkNetPermission(
  permission: PermissionSpec['net'],
  targetHost: string
): PermissionCheckResult {
  if (!permission || permission === 'none') {
    return {
      granted: false,
      reason: 'Network access not permitted (net: none)',
    };
  }

  // Normalize host (remove protocol, port, path)
  const normalizedTarget = normalizeHost(targetHost);

  // Check denyHosts first (deny takes precedence)
  if (permission.denyHosts && permission.denyHosts.length > 0) {
    for (const denied of permission.denyHosts) {
      const deniedNormalized = denied.toLowerCase();
      if (deniedNormalized === normalizedTarget) {
        return {
          granted: false,
          reason: `Host ${targetHost} is in denyHosts`,
          details: { targetHost, denyHosts: permission.denyHosts },
        };
      }
      // Wildcard match
      if (deniedNormalized.startsWith('*.')) {
        const domain = deniedNormalized.slice(2);
        if (
          normalizedTarget === domain ||
          normalizedTarget.endsWith(`.${domain}`)
        ) {
          return {
            granted: false,
            reason: `Host ${targetHost} matches denyHost pattern`,
            details: { targetHost, denyHosts: permission.denyHosts },
          };
        }
      }
    }
  }

  // Check allowHosts
  if (permission.allowHosts && permission.allowHosts.length > 0) {
    for (const allowed of permission.allowHosts) {
      const allowedNormalized = allowed.toLowerCase();
      // Exact match
      if (allowedNormalized === normalizedTarget) {
        return { granted: true };
      }
      // Wildcard match
      if (allowedNormalized.startsWith('*.')) {
        const domain = allowedNormalized.slice(2);
        if (
          normalizedTarget === domain ||
          normalizedTarget.endsWith(`.${domain}`)
        ) {
          return { granted: true };
        }
      }
    }
  }

  // Check CIDR blocks (if host is an IP address)
  if (permission.allowCidrs && permission.allowCidrs.length > 0) {
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(normalizedTarget)) {
      for (const cidr of permission.allowCidrs) {
        if (isIpInCidr(normalizedTarget, cidr)) {
          return { granted: true };
        }
      }
    }
  }

  // If allowHosts specified but no match, deny
  if (permission.allowHosts && permission.allowHosts.length > 0) {
    return {
      granted: false,
      reason: `Host ${targetHost} not in allowHosts`,
      details: { targetHost, allowHosts: permission.allowHosts },
    };
  }

  // If no allowHosts, deny by default
  return {
    granted: false,
    reason: 'Network access not permitted (no allowHosts specified)',
    details: { targetHost },
  };
}

/**
 * Environment variable permission check
 * Validates if env var is in whitelist (supports wildcards)
 */
export function checkEnvPermission(
  whitelist: string[] | undefined,
  envVar: string
): PermissionCheckResult {
  if (!whitelist || whitelist.length === 0) {
    return {
      granted: false,
      reason: 'Environment variable access not permitted (env whitelist is empty)',
    };
  }

  // Check exact match
  if (whitelist.includes(envVar)) {
    return { granted: true };
  }

  // Check wildcard patterns (e.g., 'KB_LABS_*')
  const granted = whitelist.some((pattern) => {
    if (pattern.endsWith('*')) {
      return envVar.startsWith(pattern.slice(0, -1));
    }
    return false;
  });

  return {
    granted,
    reason: granted
      ? undefined
      : `Environment variable ${envVar} not in whitelist`,
    details: { envVar, whitelist },
  };
}

/**
 * Normalize hostname for comparison
 */
function normalizeHost(host: string): string {
  // Remove protocol
  let normalized = host.replace(/^https?:\/\//, '');
  // Remove port
  const portPart = normalized.split(':')[0];
  normalized = portPart || normalized;
  // Remove path
  const pathPart = normalized.split('/')[0];
  normalized = pathPart || normalized;
  // Remove trailing dot
  normalized = normalized.replace(/\.$/, '');
  // Lowercase
  return normalized.toLowerCase();
}

/**
 * State broker permission check
 * Validates namespace access based on permission spec
 */
export function checkStatePermission(
  permission: PermissionSpec['state'],
  namespace: string,
  operation: 'read' | 'write' | 'delete',
  pluginId: string
): PermissionCheckResult {
  if (!permission) {
    return {
      granted: false,
      reason: 'State access not permitted (no state permission)',
    };
  }

  // Own namespace access (plugin can access its own namespace by default)
  const ownNamespace = pluginId.replace('@kb-labs/', '').replace(/-plugin$/, '');

  if (namespace === ownNamespace) {
    // Check if own namespace access is explicitly restricted
    if (permission.own) {
      const allowed = permission.own[operation] ?? true; // default: allow own namespace
      if (!allowed) {
        return {
          granted: false,
          reason: `State ${operation} on own namespace '${namespace}' is restricted`,
          details: { namespace, operation, ownPermissions: permission.own },
        };
      }
    }
    return { granted: true };
  }

  // External namespace access (requires explicit declaration)
  if (!permission.external || permission.external.length === 0) {
    return {
      granted: false,
      reason: `State access to external namespace '${namespace}' not permitted (no external permissions declared)`,
      details: { namespace, operation },
    };
  }

  // Find matching external namespace permission
  const externalPerm = permission.external.find((ext) => ext.namespace === namespace);

  if (!externalPerm) {
    return {
      granted: false,
      reason: `State access to external namespace '${namespace}' not permitted (namespace not in external permissions)`,
      details: {
        namespace,
        operation,
        declaredNamespaces: permission.external.map(e => e.namespace),
      },
    };
  }

  // Check if the specific operation is allowed
  const allowed = externalPerm[operation] ?? false; // default: deny external access

  if (!allowed) {
    return {
      granted: false,
      reason: `State ${operation} on external namespace '${namespace}' not permitted`,
      details: {
        namespace,
        operation,
        externalPermissions: externalPerm,
      },
    };
  }

  // Require reason for write/delete on external namespaces
  if ((operation === 'write' || operation === 'delete') && !externalPerm.reason) {
    return {
      granted: false,
      reason: `State ${operation} on external namespace '${namespace}' requires a reason in manifest`,
      details: { namespace, operation },
    };
  }

  return { granted: true };
}

/**
 * Check all permissions from PermissionSpec
 */
export interface PermissionCheckAllResult {
  fs?: PermissionCheckResult;
  net?: PermissionCheckResult;
  env?: PermissionCheckResult;
  state?: PermissionCheckResult;
  allGranted: boolean;
}

export async function checkAllPermissions(
  permissions: PermissionSpec | undefined,
  context: {
    fsTarget?: string;
    netTarget?: string;
    envVar?: string;
    stateNamespace?: string;
    stateOperation?: 'read' | 'write' | 'delete';
    pluginId?: string;
  }
): Promise<PermissionCheckAllResult> {
  if (!permissions) {
    return { allGranted: true };
  }

  const results: PermissionCheckAllResult = {
    allGranted: true,
  };

  // Check FS permission
  if (permissions.fs !== undefined && context.fsTarget) {
    results.fs = await checkFsPermission(permissions.fs, context.fsTarget);
    if (!results.fs.granted) {
      results.allGranted = false;
    }
  }

  // Check network permission
  if (permissions.net !== undefined && context.netTarget) {
    results.net = checkNetPermission(permissions.net, context.netTarget);
    if (!results.net.granted) {
      results.allGranted = false;
    }
  }

  // Check env permission
  if (permissions.env && context.envVar) {
    results.env = checkEnvPermission(
      permissions.env.allow,
      context.envVar
    );
    if (!results.env.granted) {
      results.allGranted = false;
    }
  }

  // Check state permission
  if (
    permissions.state !== undefined &&
    context.stateNamespace &&
    context.stateOperation &&
    context.pluginId
  ) {
    results.state = checkStatePermission(
      permissions.state,
      context.stateNamespace,
      context.stateOperation,
      context.pluginId
    );
    if (!results.state.granted) {
      results.allGranted = false;
    }
  }

  return results;
}
