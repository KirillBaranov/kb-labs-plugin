/**
 * @module @kb-labs/plugin-runtime/io/fs
 * FS wrapper with path-based allow/deny enforcement
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PermissionSpec } from '@kb-labs/plugin-manifest';
import type { FSLike, ExecutionContext } from '../types.js';
import { minimatch } from 'minimatch';
import { emitAnalyticsEvent } from '../analytics.js';

/**
 * Check if path matches glob pattern
 * @param filePath - File path
 * @param patterns - Glob patterns
 * @returns True if any pattern matches
 */
function matchesGlob(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) =>
    minimatch(filePath, pattern, { dot: true })
  );
}

/**
 * Normalize and validate path
 * @param userPath - User-provided path
 * @param baseDir - Base directory (workdir or outdir)
 * @returns Normalized absolute path
 * @throws Error if path traversal is detected
 */
function normalizePath(userPath: string, baseDir: string): string {
  const normalized = path.normalize(userPath);
  const resolved = path.resolve(baseDir, normalized);
  const baseResolved = path.resolve(baseDir);

  // Check for path traversal
  if (!resolved.startsWith(baseResolved)) {
    throw new Error(
      `Path traversal attempt: ${userPath} resolves to ${resolved} outside base directory ${baseDir}`
    );
  }

  return resolved;
}

/**
 * Check if path is in artifact directory (blocked by default)
 * @param normalizedPath - Normalized file path
 * @param baseDir - Base directory
 * @returns True if path is in artifact directory
 */
function isArtifactPath(normalizedPath: string, baseDir: string): boolean {
  // Check common artifact directory patterns
  const artifactPatterns = [
    '**/.artifacts/**',
    '**/artifacts/**',
    '**/.artifact/**',
  ];

  const relativePath = path.relative(baseDir, normalizedPath);
  return artifactPatterns.some((pattern) =>
    minimatch(relativePath, pattern, { dot: true })
  );
}

/**
 * Check if path is allowed by FS permissions
 * @param filePath - File path
 * @param fsPerms - FS permissions
 * @param baseDir - Base directory
 * @param isWrite - True for write operations
 * @param ctx - Execution context (for logging)
 * @returns True if allowed
 * @throws Error if not allowed
 */
async function checkFsPermission(
  filePath: string,
  fsPerms: PermissionSpec['fs'],
  baseDir: string,
  isWrite: boolean,
  ctx?: ExecutionContext
): Promise<void> {
  if (!fsPerms) {
    throw new Error('FS access not permitted (no fs permission)');
  }

  if (fsPerms.mode === 'none') {
    throw new Error('FS access not permitted (fs.mode: none)');
  }

  if (isWrite && fsPerms.mode === 'read') {
    throw new Error('FS write not permitted (fs.mode: read)');
  }

  // Normalize path
  const normalized = normalizePath(filePath, baseDir);

  // Check for artifact directory bypass attempt
  if (isArtifactPath(normalized, baseDir)) {
    // Log bypass attempt
    if (ctx) {
      await emitAnalyticsEvent('plugin.fs.bypass.attempt', {
        caller: ctx.pluginId,
        path: filePath,
        operation: isWrite ? 'write' : 'read',
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        requestId: ctx.requestId,
      });
    }

    throw new Error(
      `FS access denied: direct access to artifact directory is not allowed. Use ctx.artifacts.read/write() instead.`
    );
  }

  // Check deny patterns first (deny takes precedence)
  if (fsPerms.deny && fsPerms.deny.length > 0) {
    if (matchesGlob(normalized, fsPerms.deny)) {
      throw new Error(
        `FS access denied: path ${filePath} matches deny pattern`
      );
    }
  }

  // Check allow patterns
  if (fsPerms.allow && fsPerms.allow.length > 0) {
    if (!matchesGlob(normalized, fsPerms.allow)) {
      throw new Error(
        `FS access denied: path ${filePath} does not match any allow pattern`
      );
    }
  }
}

/**
 * Create FS shim with permission checks
 * @param fsPerms - FS permissions
 * @param workdir - Working directory
 * @param outdir - Output directory (for writes)
 * @param ctx - Execution context (for logging bypass attempts)
 * @returns FS-like interface
 */
export function createFsShim(
  fsPerms: PermissionSpec['fs'],
  workdir: string,
  outdir?: string,
  ctx?: ExecutionContext
): FSLike {
  const baseDir = workdir;
  const writeDir = outdir || workdir;

  return {
    async readFile(
      filePath: string,
      options?: { encoding?: BufferEncoding }
    ): Promise<string | Buffer> {
      await checkFsPermission(filePath, fsPerms, baseDir, false, ctx);
      const resolved = normalizePath(filePath, baseDir);
      return fs.readFile(resolved, options);
    },

    async writeFile(
      filePath: string,
      data: string | Buffer,
      options?: { encoding?: BufferEncoding }
    ): Promise<void> {
      await checkFsPermission(filePath, fsPerms, writeDir, true, ctx);
      const resolved = normalizePath(filePath, writeDir);

      // Dry-run mode: log operation instead of executing
      if (ctx?.dryRun) {
        const size = Buffer.isBuffer(data) ? data.length : Buffer.byteLength(data, options?.encoding || 'utf8');
        console.log(`[DRY-RUN] Would write to: ${resolved} (${size} bytes)`);
        return;
      }

      // Ensure directory exists
      const dir = path.dirname(resolved);
      await fs.mkdir(dir, { recursive: true });

      return fs.writeFile(resolved, data, options);
    },

    async readdir(dirPath: string): Promise<string[]> {
      await checkFsPermission(dirPath, fsPerms, baseDir, false, ctx);
      const resolved = normalizePath(dirPath, baseDir);
      return fs.readdir(resolved);
    },

    async stat(filePath: string): Promise<{
      isFile: () => boolean;
      isDirectory: () => boolean;
      size: number;
      mtime: Date;
    }> {
      await checkFsPermission(filePath, fsPerms, baseDir, false, ctx);
      const resolved = normalizePath(filePath, baseDir);
      const stats = await fs.stat(resolved);
      return {
        isFile: () => stats.isFile(),
        isDirectory: () => stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtime,
      };
    },

    async mkdir(
      dirPath: string,
      options?: { recursive?: boolean }
    ): Promise<void> {
      await checkFsPermission(dirPath, fsPerms, writeDir, true, ctx);
      const resolved = normalizePath(dirPath, writeDir);
      
      if (ctx?.dryRun) {
        console.log(`[DRY-RUN] Would create directory: ${resolved}${options?.recursive ? ' (recursive)' : ''}`);
        return;
      }
      
      await fs.mkdir(resolved, options);
    },

    async unlink(filePath: string): Promise<void> {
      await checkFsPermission(filePath, fsPerms, writeDir, true, ctx);
      const resolved = normalizePath(filePath, writeDir);
      
      if (ctx?.dryRun) {
        console.log(`[DRY-RUN] Would delete file: ${resolved}`);
        return;
      }
      
      return fs.unlink(resolved);
    },

    async rmdir(
      dirPath: string,
      options?: { recursive?: boolean }
    ): Promise<void> {
      await checkFsPermission(dirPath, fsPerms, writeDir, true, ctx);
      const resolved = normalizePath(dirPath, writeDir);
      
      if (ctx?.dryRun) {
        console.log(`[DRY-RUN] Would remove directory: ${resolved}${options?.recursive ? ' (recursive)' : ''}`);
        return;
      }
      
      return fs.rmdir(resolved, options);
    },
  };
}

