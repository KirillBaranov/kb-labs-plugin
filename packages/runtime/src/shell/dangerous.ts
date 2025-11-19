/**
 * @module @kb-labs/plugin-runtime/shell/dangerous
 * Dangerous command detection and confirmation
 */

import type { ShellPermission } from '@kb-labs/plugin-manifest';
import type { ShellCommandSpec, DangerousCommandResult } from './types.js';
import { minimatch } from 'minimatch';

/**
 * Default dangerous command patterns
 */
const DEFAULT_DANGEROUS_PATTERNS = [
  // File deletion
  'rm -rf',
  'rm -r',
  'rm -f',
  'rm *',
  // Git destructive operations
  'git reset --hard',
  'git clean -fd',
  'git push --force',
  'git push -f',
  // Database operations
  'drop database',
  'delete from',
  'truncate table',
  // System operations
  'format c:',
  'dd if=/dev/zero',
  'mkfs',
  'fdisk',
  // Package manager destructive operations
  'npm uninstall *',
  'pnpm remove *',
  'yarn remove *',
];

/**
 * Check if command matches a dangerous pattern
 */
function matchesDangerousPattern(
  pattern: string | { command: string; args?: string[] },
  spec: ShellCommandSpec
): boolean {
  if (typeof pattern === 'string') {
    const specStr = `${spec.command} ${spec.args.join(' ')}`.trim();
    // Exact match
    if (pattern === specStr) {
      return true;
    }
    // Command match
    if (pattern === spec.command) {
      return true;
    }
    // Glob pattern match
    if (minimatch(specStr, pattern) || minimatch(spec.command, pattern)) {
      return true;
    }
    // Prefix match (e.g., "rm -rf" matches "rm -rf /tmp")
    if (specStr.startsWith(pattern + ' ')) {
      return true;
    }
    return false;
  }

  // Object pattern
  if (pattern.command === spec.command) {
    if (pattern.args && pattern.args.length > 0) {
      return pattern.args.every((arg, i) => spec.args[i] === arg);
    }
    return true;
  }

  return false;
}

/**
 * Check if command is dangerous
 */
export function checkDangerousCommand(
  perms: ShellPermission | undefined,
  spec: ShellCommandSpec
): DangerousCommandResult {
  // Build list of dangerous patterns (default + manifest)
  const dangerousPatterns: Array<string | { command: string; args?: string[] }> = [
    ...DEFAULT_DANGEROUS_PATTERNS,
  ];

  if (perms?.requireConfirmation) {
    dangerousPatterns.push(...perms.requireConfirmation);
  }

  // Check against all patterns
  for (const pattern of dangerousPatterns) {
    if (matchesDangerousPattern(pattern, spec)) {
      const patternStr =
        typeof pattern === 'string'
          ? pattern
          : `${pattern.command} ${pattern.args?.join(' ') || ''}`.trim();
      return {
        dangerous: true,
        reason: `matches dangerous pattern: ${patternStr}`,
        requireConfirmation: true,
      };
    }
  }

  return {
    dangerous: false,
    requireConfirmation: false,
  };
}

/**
 * Format confirmation message for dangerous command
 */
export function formatConfirmationMessage(spec: ShellCommandSpec, reason: string): string {
  const commandStr = `${spec.command} ${spec.args.join(' ')}`.trim();
  return `⚠️  Dangerous command detected: ${commandStr}\nReason: ${reason}\n\nAre you sure you want to proceed? (y/N)`;
}



