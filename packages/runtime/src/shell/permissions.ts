/**
 * @module @kb-labs/plugin-runtime/shell/permissions
 * Permission resolution for shell execution
 */

import type { ShellPermission } from '@kb-labs/plugin-manifest';
import type { ShellCommandSpec, ShellPermissionResult } from './types.js';
import { minimatch } from 'minimatch';

/**
 * Normalize command spec to string pattern for matching
 */
function commandSpecToString(spec: ShellCommandSpec): string {
  const argsStr = spec.args.length > 0 ? ` ${spec.args.join(' ')}` : '';
  return `${spec.command}${argsStr}`;
}

/**
 * Check if a pattern matches a command spec
 */
function matchesPattern(
  pattern: string | { command: string; args?: string[] },
  spec: ShellCommandSpec
): boolean {
  // Handle string patterns (glob/minimatch)
  if (typeof pattern === 'string') {
    const specStr = commandSpecToString(spec);
    // Try exact match first
    if (pattern === specStr) {
      return true;
    }
    // Try command-only match (e.g., "tsc" matches "tsc --version")
    if (pattern === spec.command) {
      return true;
    }
    // Try glob pattern match (e.g., "tsc *" matches "tsc --noEmit")
    if (minimatch(specStr, pattern) || minimatch(spec.command, pattern)) {
      return true;
    }
    // Try command prefix match (e.g., "pnpm exec *" matches "pnpm exec vite build")
    if (pattern.endsWith(' *')) {
      const prefix = pattern.slice(0, -2);
      if (specStr.startsWith(prefix + ' ')) {
        return true;
      }
    }
    return false;
  }

  // Handle object patterns with command and optional args
  if (pattern.command === spec.command) {
    // If args specified, they must match exactly
    if (pattern.args && pattern.args.length > 0) {
      return pattern.args.every((arg, i) => spec.args[i] === arg);
    }
    // If no args specified, command name match is enough
    return true;
  }

  return false;
}

/**
 * Resolve shell permission decision
 * Priority: DENY (explicit) → allow → default DENY
 */
export function resolveShellDecision(
  perms: ShellPermission | undefined,
  spec: ShellCommandSpec
): ShellPermissionResult {
  // Default deny if no permissions
  if (!perms) {
    return {
      allow: false,
      reason: 'default deny - no shell permissions declared',
      remediation: 'Add permissions.shell.allow to manifest',
    };
  }

  // 1. Explicit deny wins - highest priority
  if (perms.deny && perms.deny.length > 0) {
    for (const denyPattern of perms.deny) {
      if (matchesPattern(denyPattern, spec)) {
        return {
          allow: false,
          reason: 'explicit deny',
          remediation: `Remove '${typeof denyPattern === 'string' ? denyPattern : commandSpecToString(denyPattern as ShellCommandSpec)}' from permissions.shell.deny`,
        };
      }
    }
  }

  // 2. Check allow list
  if (perms.allow && perms.allow.length > 0) {
    const allowed = perms.allow.some((allowPattern) =>
      matchesPattern(allowPattern, spec)
    );

    if (allowed) {
      return { allow: true };
    }

    return {
      allow: false,
      reason: 'command not in allow list',
      remediation: `Add '${commandSpecToString(spec)}' or a matching pattern to permissions.shell.allow`,
    };
  }

  // 3. Default deny - no allow list means nothing is allowed
  return {
    allow: false,
    reason: 'default deny - no commands allowed',
    remediation: 'Add permissions.shell.allow to manifest',
  };
}



