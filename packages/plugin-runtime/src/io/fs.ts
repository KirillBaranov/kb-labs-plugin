/**
 * @module @kb-labs/plugin-runtime/io/fs
 * FS wrapper with path-based allow/deny enforcement
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Operation, OperationId } from '@kb-labs/setup-engine-operations';
import type { PermissionSpec } from '@kb-labs/plugin-manifest';
import type { FSLike, ExecutionContext } from '../types';
import type { OperationTracker } from '../operations/operation-tracker';
import { minimatch } from 'minimatch';
import { emitAnalyticsEvent } from '../analytics';

const MAX_INLINE_CONTENT_LENGTH = 4096;
const MAX_TRACKED_CONTENT_BYTES = 5 * 1024 * 1024; // 5MB safety cap

function toWorkspacePath(resolvedPath: string, baseDir: string): string {
  const relative = path.relative(baseDir, resolvedPath);
  const normalized = relative === '' ? '.' : relative;
  return normalized.split(path.sep).join('/');
}

function computeByteLength(data: string | Buffer, encoding?: BufferEncoding): number {
  if (typeof data === 'string') {
    return Buffer.byteLength(data, encoding);
  }
  return data.byteLength;
}

function toBuffer(data: string | Buffer, encoding?: BufferEncoding): Buffer {
  return typeof data === 'string'
    ? Buffer.from(data, encoding ?? 'utf8')
    : Buffer.from(data);
}

function maybeInlineContent(
  data: string | Buffer,
  encoding?: BufferEncoding
): string | undefined {
  if (typeof data === 'string') {
    return data.length <= MAX_INLINE_CONTENT_LENGTH ? data : undefined;
  }

  if (data.length <= MAX_INLINE_CONTENT_LENGTH) {
    try {
      return data.toString(encoding ?? 'utf8');
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function createNotFoundError(filePath: string): NodeJS.ErrnoException {
  const error = new Error(
    `ENOENT: no such file or directory, access '${filePath}'`
  ) as NodeJS.ErrnoException;
  error.code = 'ENOENT';
  error.errno = -2;
  error.path = filePath;
  error.syscall = 'access';
  return error;
}

/**
 * Check if path matches glob pattern (absolute or workspace-relative)
 * @param filePath - Normalized absolute file path
 * @param baseDir - Workspace base directory
 * @param patterns - Glob patterns
 * @returns True if any pattern matches
 */
function matchesGlob(
  filePath: string,
  baseDir: string,
  patterns: string[],
): boolean {
  const relativePath = path.relative(baseDir, filePath) || '';
  return patterns.some((pattern) => {
    const options = { dot: true };
    return (
      minimatch(filePath, pattern, options) ||
      minimatch(relativePath, pattern, options)
    );
  });
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
    if (matchesGlob(normalized, baseDir, fsPerms.deny)) {
      throw new Error(
        `FS access denied: path ${filePath} matches deny pattern`
      );
    }
  }

  // Check allow patterns
  if (fsPerms.allow && fsPerms.allow.length > 0) {
    if (!matchesGlob(normalized, baseDir, fsPerms.allow)) {
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
  const tracker: OperationTracker | undefined = ctx?.operationTracker;
  const overlayEnabled = Boolean(ctx?.dryRun);
  const overlayFiles = overlayEnabled ? new Map<string, Buffer>() : undefined;
  const overlayDirs = overlayEnabled ? new Set<string>() : undefined;
  const deletedPaths = overlayEnabled ? new Set<string>() : undefined;

  const ensureOverlayDirExists = (dirPath: string): void => {
    if (!overlayEnabled || !overlayDirs) {
      return;
    }
    let current = path.resolve(dirPath);
    const root = path.parse(current).root;
    while (!overlayDirs.has(current)) {
      overlayDirs.add(current);
      deletedPaths?.delete(current);
      if (current === root) {
        break;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  };

  const recordOverlayFile = (resolved: string, buffer: Buffer): void => {
    if (!overlayEnabled || !overlayFiles) {
      return;
    }
    ensureOverlayDirExists(path.dirname(resolved));
    overlayFiles.set(resolved, buffer);
    deletedPaths?.delete(resolved);
  };

  const markOverlayDeleted = (resolved: string): void => {
    if (!overlayEnabled) {
      return;
    }
    overlayFiles?.delete(resolved);
    overlayDirs?.delete(resolved);
    deletedPaths?.add(resolved);

    const prefix = resolved.endsWith(path.sep)
      ? resolved
      : `${resolved}${path.sep}`;
    if (overlayFiles) {
      for (const key of Array.from(overlayFiles.keys())) {
        if (key.startsWith(prefix)) {
          overlayFiles.delete(key);
        }
      }
    }
    if (overlayDirs) {
      for (const dir of Array.from(overlayDirs)) {
        if (dir.startsWith(prefix)) {
          overlayDirs.delete(dir);
        }
      }
    }
  };

  const isOverlayDeleted = (resolved: string): boolean =>
    Boolean(deletedPaths?.has(resolved));

  const getOverlayFile = (resolved: string): Buffer | undefined =>
    overlayFiles?.get(resolved);

  const hasOverlayDir = (resolved: string): boolean =>
    Boolean(overlayDirs?.has(resolved));

  const listOverlayEntries = (dirPath: string): Set<string> => {
    const entries = new Set<string>();
    if (overlayFiles) {
      for (const filePath of overlayFiles.keys()) {
        if (path.dirname(filePath) === dirPath && !isOverlayDeleted(filePath)) {
          entries.add(path.basename(filePath));
        }
      }
    }
    if (overlayDirs) {
      for (const dir of overlayDirs) {
        if (dir !== dirPath && path.dirname(dir) === dirPath && !isOverlayDeleted(dir)) {
          entries.add(path.basename(dir));
        }
      }
    }
    if (deletedPaths) {
      for (const deleted of deletedPaths) {
        if (path.dirname(deleted) === dirPath) {
          entries.delete(path.basename(deleted));
        }
      }
    }
    return entries;
  };

  const createVirtualStats = (kind: 'file' | 'dir', size = 0) => ({
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
    size,
    mtime: new Date()
  });

  type InternalTrackOptions = {
    status?: 'pending' | 'applied' | 'skipped' | 'failed';
    reason?: string;
    annotations?: Record<string, unknown>;
    tags?: string[];
  };

  const trackFsOperation = (
    operation: Operation,
    description: string,
    resolvedPath: string,
    options: InternalTrackOptions = {}
  ): OperationId | undefined => {
    if (!tracker) {
      return undefined;
    }

    const annotations = {
      absolutePath: resolvedPath,
      relativeToWorkdir: toWorkspacePath(resolvedPath, workdir),
      relativeToWriteDir: toWorkspacePath(resolvedPath, writeDir),
      dryRun: Boolean(ctx?.dryRun),
      ...(options.annotations ?? {})
    };

    const tags = Array.from(new Set(['fs', ...(options.tags ?? [])]));
    const metadata = tracker.createMetadata('fs', description, {
      annotations,
      tags
    });

    return tracker.track(operation, metadata, {
      status: options.status ?? 'pending',
      reason: options.reason
    });
  };

  const markApplied = (id?: OperationId) => {
    if (tracker && id) {
      tracker.markApplied(id);
    }
  };

  const markFailed = (id: OperationId | undefined, error: unknown) => {
    if (tracker && id) {
      const reason = error instanceof Error ? error.message : String(error);
      tracker.markFailed(id, reason);
    }
  };

  return {
    async readFile(
      filePath: string,
      options?: { encoding?: BufferEncoding }
    ): Promise<string | Buffer> {
      await checkFsPermission(filePath, fsPerms, baseDir, false, ctx);
      const resolved = normalizePath(filePath, baseDir);
      if (overlayEnabled) {
        if (isOverlayDeleted(resolved)) {
          throw createNotFoundError(resolved);
        }
        const overlayBuffer = getOverlayFile(resolved);
        if (overlayBuffer) {
          if (options?.encoding) {
            return overlayBuffer.toString(options.encoding);
          }
          return Buffer.from(overlayBuffer);
        }
      }
      return fs.readFile(resolved, options);
    },

    async writeFile(
      filePath: string,
      data: string | Buffer,
      options?: { encoding?: BufferEncoding }
    ): Promise<void> {
      await checkFsPermission(filePath, fsPerms, writeDir, true, ctx);
      const resolved = normalizePath(filePath, writeDir);
      const bufferData = toBuffer(data, options?.encoding);
      if (bufferData.byteLength > MAX_TRACKED_CONTENT_BYTES) {
        throw new Error(
          `FS write exceeds max tracked size (${MAX_TRACKED_CONTENT_BYTES} bytes) for ${filePath}. ` +
            'Use template-based operations for large files.'
        );
      }
      const operation: Operation = {
        kind: 'file',
        action: 'ensure',
        path: toWorkspacePath(resolved, workdir),
        content: maybeInlineContent(data, options?.encoding),
        encoding: typeof data === 'string' ? options?.encoding : undefined
      };

      const bytes = computeByteLength(data, options?.encoding);
      const recordId = trackFsOperation(operation, `Write file ${operation.path}`, resolved, {
        annotations: {
          bytes,
          rawContentBase64: bufferData.toString('base64'),
          rawContentSize: bufferData.byteLength,
          rawContentEncoding: typeof data === 'string' ? options?.encoding ?? 'utf8' : 'buffer'
        },
        tags: ['write']
      });

      if (ctx?.dryRun) {
        recordOverlayFile(resolved, bufferData);
        return;
      }

      try {
        const dir = path.dirname(resolved);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(resolved, bufferData, options);
        markApplied(recordId);
      } catch (error) {
        markFailed(recordId, error);
        throw error;
      }
    },

    async readdir(dirPath: string): Promise<string[]> {
      await checkFsPermission(dirPath, fsPerms, baseDir, false, ctx);
      const resolved = normalizePath(dirPath, baseDir);
      if (overlayEnabled) {
        if (isOverlayDeleted(resolved)) {
          throw createNotFoundError(resolved);
        }
        const entries = new Set<string>();
        let readFromDisk = true;
        try {
          const diskEntries = await fs.readdir(resolved);
          for (const entry of diskEntries) {
            entries.add(entry);
          }
        } catch (error: any) {
          if (error?.code !== 'ENOENT') {
            throw error;
          }
          readFromDisk = false;
        }
        if (!readFromDisk && !hasOverlayDir(resolved)) {
          throw createNotFoundError(resolved);
        }
        for (const entry of listOverlayEntries(resolved)) {
          entries.add(entry);
        }
        return Array.from(entries);
      }
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
      if (overlayEnabled) {
        if (isOverlayDeleted(resolved)) {
          throw createNotFoundError(resolved);
        }
        const overlayBuffer = getOverlayFile(resolved);
        if (overlayBuffer) {
          return createVirtualStats('file', overlayBuffer.byteLength);
        }
        if (hasOverlayDir(resolved)) {
          return createVirtualStats('dir', 0);
        }
      }
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
      const operation: Operation = {
        kind: 'file',
        action: 'ensure',
        path: toWorkspacePath(resolved, workdir)
      };

      const recordId = trackFsOperation(operation, `Create directory ${operation.path}`, resolved, {
        annotations: {
          recursive: Boolean(options?.recursive)
        },
        tags: ['directory', 'mkdir']
      });
      
      if (ctx?.dryRun) {
        ensureOverlayDirExists(resolved);
        return;
      }
      
      try {
        await fs.mkdir(resolved, options);
        markApplied(recordId);
      } catch (error) {
        markFailed(recordId, error);
        throw error;
      }
    },

    async unlink(filePath: string): Promise<void> {
      await checkFsPermission(filePath, fsPerms, writeDir, true, ctx);
      const resolved = normalizePath(filePath, writeDir);
      const operation: Operation = {
        kind: 'file',
        action: 'delete',
        path: toWorkspacePath(resolved, workdir)
      };

      const recordId = trackFsOperation(operation, `Delete file ${operation.path}`, resolved, {
        tags: ['delete']
      });
      
      if (ctx?.dryRun) {
        markOverlayDeleted(resolved);
        return;
      }
      
      try {
        await fs.unlink(resolved);
        markApplied(recordId);
      } catch (error) {
        markFailed(recordId, error);
        throw error;
      }
    },

    async rmdir(
      dirPath: string,
      options?: { recursive?: boolean }
    ): Promise<void> {
      await checkFsPermission(dirPath, fsPerms, writeDir, true, ctx);
      const resolved = normalizePath(dirPath, writeDir);
      const operation: Operation = {
        kind: 'file',
        action: 'delete',
        path: toWorkspacePath(resolved, workdir)
      };

      const recordId = trackFsOperation(operation, `Remove directory ${operation.path}`, resolved, {
        annotations: {
          recursive: Boolean(options?.recursive)
        },
        tags: ['directory', 'delete']
      });
      
      if (ctx?.dryRun) {
        markOverlayDeleted(resolved);
        return;
      }
      
      try {
        await fs.rmdir(resolved, options);
        markApplied(recordId);
      } catch (error) {
        markFailed(recordId, error);
        throw error;
      }
    },
  };
}

