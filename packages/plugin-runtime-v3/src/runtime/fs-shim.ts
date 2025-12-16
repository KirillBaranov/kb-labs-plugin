/**
 * Sandboxed filesystem implementation
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FSShim, FileStat, DirEntry, MkdirOptions, RmOptions, WriteFileOptions, PermissionSpec } from '@kb-labs/plugin-contracts-v3';
import { PermissionError } from '@kb-labs/plugin-contracts-v3';

/**
 * Patterns that are always denied (security)
 */
const DENIED_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /\.env$/,
  /\.env\./,
  /\.ssh/,
  /\/etc\//,
  /\/usr\//,
  /\/var\//,
  /credentials/i,
  /secret/i,
  /password/i,
  /\.pem$/,
  /\.key$/,
];

export interface CreateFSShimOptions {
  permissions: PermissionSpec;
  cwd: string;
  outdir?: string;
}

/**
 * Create a sandboxed filesystem shim
 */
export function createFSShim(options: CreateFSShimOptions): FSShim {
  const { permissions, cwd, outdir } = options;

  // Build allowed paths for reading
  const readablePaths = new Set<string>([
    path.resolve(cwd), // cwd always allowed for reading
    ...(permissions.fs?.read ?? []).map(p => path.resolve(cwd, p)),
  ]);

  // Build allowed paths for writing
  const writablePaths = new Set<string>([
    outdir ? path.resolve(outdir) : path.resolve(cwd, '.kb/output'), // outdir always allowed
    ...(permissions.fs?.write ?? []).map(p => path.resolve(cwd, p)),
  ]);

  function normalizePath(filePath: string): string {
    return path.normalize(path.resolve(cwd, filePath));
  }

  function checkDeniedPatterns(normalizedPath: string): void {
    for (const pattern of DENIED_PATTERNS) {
      if (pattern.test(normalizedPath)) {
        throw new PermissionError(`Access denied: path matches denied pattern`, {
          path: normalizedPath,
          pattern: pattern.toString(),
        });
      }
    }
  }

  function checkReadPermission(filePath: string): string {
    const normalized = normalizePath(filePath);
    checkDeniedPatterns(normalized);

    const isAllowed = Array.from(readablePaths).some(allowed =>
      normalized.startsWith(allowed)
    );

    if (!isAllowed) {
      throw new PermissionError(`Read access denied`, { path: filePath });
    }

    return normalized;
  }

  function checkWritePermission(filePath: string): string {
    const normalized = normalizePath(filePath);
    checkDeniedPatterns(normalized);

    const isAllowed = Array.from(writablePaths).some(allowed =>
      normalized.startsWith(allowed)
    );

    if (!isAllowed) {
      throw new PermissionError(`Write access denied`, { path: filePath });
    }

    return normalized;
  }

  return {
    async readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): Promise<string> {
      const resolved = checkReadPermission(filePath);
      return fs.readFile(resolved, encoding);
    },

    async readFileBuffer(filePath: string): Promise<Uint8Array> {
      const resolved = checkReadPermission(filePath);
      const buffer = await fs.readFile(resolved);
      return new Uint8Array(buffer);
    },

    async writeFile(
      filePath: string,
      content: string | Uint8Array,
      options?: WriteFileOptions
    ): Promise<void> {
      const resolved = checkWritePermission(filePath);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(resolved), { recursive: true });

      const writeOptions: { encoding?: BufferEncoding; flag?: string } = {
        encoding: options?.encoding ?? 'utf-8',
      };

      if (options?.append) {
        writeOptions.flag = 'a';
      }

      await fs.writeFile(resolved, content, writeOptions);
    },

    async readdir(dirPath: string): Promise<string[]> {
      const resolved = checkReadPermission(dirPath);
      return fs.readdir(resolved);
    },

    async readdirWithStats(dirPath: string): Promise<DirEntry[]> {
      const resolved = checkReadPermission(dirPath);
      const entries = await fs.readdir(resolved, { withFileTypes: true });

      return entries.map(entry => ({
        name: entry.name,
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      }));
    },

    async stat(filePath: string): Promise<FileStat> {
      const resolved = checkReadPermission(filePath);
      const stats = await fs.stat(resolved);

      return {
        isFile: () => stats.isFile(),
        isDirectory: () => stats.isDirectory(),
        size: stats.size,
        mtime: stats.mtimeMs,
        ctime: stats.ctimeMs,
      };
    },

    async exists(filePath: string): Promise<boolean> {
      try {
        const resolved = checkReadPermission(filePath);
        await fs.access(resolved);
        return true;
      } catch {
        return false;
      }
    },

    async mkdir(dirPath: string, options?: MkdirOptions): Promise<void> {
      const resolved = checkWritePermission(dirPath);
      await fs.mkdir(resolved, { recursive: options?.recursive ?? false });
    },

    async rm(filePath: string, options?: RmOptions): Promise<void> {
      const resolved = checkWritePermission(filePath);
      await fs.rm(resolved, {
        recursive: options?.recursive ?? false,
        force: options?.force ?? false,
      });
    },

    async copy(src: string, dest: string): Promise<void> {
      const resolvedSrc = checkReadPermission(src);
      const resolvedDest = checkWritePermission(dest);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
      await fs.cp(resolvedSrc, resolvedDest, { recursive: true });
    },

    async move(src: string, dest: string): Promise<void> {
      const resolvedSrc = checkWritePermission(src); // Need write to delete source
      const resolvedDest = checkWritePermission(dest);

      // Ensure parent directory exists
      await fs.mkdir(path.dirname(resolvedDest), { recursive: true });
      await fs.rename(resolvedSrc, resolvedDest);
    },

    resolve(filePath: string): string {
      return path.resolve(cwd, filePath);
    },

    relative(filePath: string): string {
      return path.relative(cwd, filePath);
    },

    join(...segments: string[]): string {
      return path.join(...segments);
    },

    dirname(filePath: string): string {
      return path.dirname(filePath);
    },

    basename(filePath: string, ext?: string): string {
      return path.basename(filePath, ext);
    },

    extname(filePath: string): string {
      return path.extname(filePath);
    },
  };
}
