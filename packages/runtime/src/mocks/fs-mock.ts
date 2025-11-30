/**
 * @module @kb-labs/plugin-runtime/mocks/fs-mock
 * Filesystem mock for testing
 */

import type { FSLike } from '../types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface MockFsOperation {
  type: 'readFile' | 'writeFile' | 'mkdir' | 'readdir' | 'stat' | 'unlink' | 'rmdir';
  path: string;
  args?: unknown[];
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
  timestamp: number;
}

export interface MockFsRecord {
  operations: MockFsOperation[];
  startTime: number;
  endTime: number;
}

/**
 * Create mock FS adapter that records operations
 */
export function createMockFs(
  baseDir: string,
  recordOperations: boolean = false
): {
  fs: FSLike;
  record: MockFsRecord;
  clearRecord: () => void;
} {
  const record: MockFsRecord = {
    operations: [],
    startTime: Date.now(),
    endTime: 0,
  };

  const recordOp = (op: Omit<MockFsOperation, 'timestamp'>) => {
    if (recordOperations) {
      record.operations.push({
        ...op,
        timestamp: Date.now(),
      });
    }
  };

  const normalizePath = (filePath: string): string => {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(baseDir, filePath);
  };

  const mockFs: FSLike = {
    async readFile(filePath: string, options?: { encoding?: BufferEncoding }): Promise<string | Buffer> {
      const normalized = normalizePath(filePath);
      const encoding = options?.encoding;
      recordOp({
        type: 'readFile',
        path: normalized,
        args: [options],
      });

      try {
        const result = await fs.readFile(normalized, encoding);
        recordOp({
          type: 'readFile',
          path: normalized,
          args: [options],
          result: encoding ? result : '<Buffer>',
        });
        return result;
      } catch (error: any) {
        recordOp({
          type: 'readFile',
          path: normalized,
          args: [options],
          error: {
            code: error.code || 'UNKNOWN',
            message: error.message,
          },
        });
        throw error;
      }
    },

    async writeFile(
      filePath: string,
      data: string | Buffer,
      options?: { encoding?: BufferEncoding }
    ): Promise<void> {
      const normalized = normalizePath(filePath);
      recordOp({
        type: 'writeFile',
        path: normalized,
        args: [typeof data === 'string' ? `<string ${data.length}>` : '<Buffer>', options],
      });

      try {
        await fs.writeFile(normalized, data, options);
        recordOp({
          type: 'writeFile',
          path: normalized,
          args: [typeof data === 'string' ? `<string ${data.length}>` : '<Buffer>', options],
          result: 'ok',
        });
      } catch (error: any) {
        recordOp({
          type: 'writeFile',
          path: normalized,
          args: [typeof data === 'string' ? `<string ${data.length}>` : '<Buffer>', options],
          error: {
            code: error.code || 'UNKNOWN',
            message: error.message,
          },
        });
        throw error;
      }
    },

    async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
      const normalized = normalizePath(dirPath);
      recordOp({
        type: 'mkdir',
        path: normalized,
        args: [options],
      });

      try {
        await fs.mkdir(normalized, options);
        recordOp({
          type: 'mkdir',
          path: normalized,
          args: [options],
          result: 'ok',
        });
      } catch (error: any) {
        recordOp({
          type: 'mkdir',
          path: normalized,
          args: [options],
          error: {
            code: error.code || 'UNKNOWN',
            message: error.message,
          },
        });
        throw error;
      }
    },

    async readdir(dirPath: string): Promise<string[]> {
      const normalized = normalizePath(dirPath);
      recordOp({
        type: 'readdir',
        path: normalized,
      });

      try {
        const result = await fs.readdir(normalized);
        recordOp({
          type: 'readdir',
          path: normalized,
          result,
        });
        return result;
      } catch (error: any) {
        recordOp({
          type: 'readdir',
          path: normalized,
          error: {
            code: error.code || 'UNKNOWN',
            message: error.message,
          },
        });
        throw error;
      }
    },

    async stat(filePath: string): Promise<import('fs').Stats> {
      const normalized = normalizePath(filePath);
      recordOp({
        type: 'stat',
        path: normalized,
      });

      try {
        const result = await fs.stat(normalized);
        recordOp({
          type: 'stat',
          path: normalized,
          result: {
            size: result.size,
            isFile: result.isFile(),
            isDirectory: result.isDirectory(),
          },
        });
        return result;
      } catch (error: any) {
        recordOp({
          type: 'stat',
          path: normalized,
          error: {
            code: error.code || 'UNKNOWN',
            message: error.message,
          },
        });
        throw error;
      }
    },

    async unlink(filePath: string): Promise<void> {
      const normalized = normalizePath(filePath);
      recordOp({
        type: 'unlink',
        path: normalized,
      });

      try {
        await fs.unlink(normalized);
        recordOp({
          type: 'unlink',
          path: normalized,
          result: 'ok',
        });
      } catch (error: any) {
        recordOp({
          type: 'unlink',
          path: normalized,
          error: {
            code: error.code || 'UNKNOWN',
            message: error.message,
          },
        });
        throw error;
      }
    },

    async rmdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
      const normalized = normalizePath(dirPath);
      recordOp({
        type: 'rmdir',
        path: normalized,
        args: [options],
      });

      try {
        await fs.rmdir(normalized, options);
        recordOp({
          type: 'rmdir',
          path: normalized,
          args: [options],
          result: 'ok',
        });
      } catch (error: any) {
        recordOp({
          type: 'rmdir',
          path: normalized,
          args: [options],
          error: {
            code: error.code || 'UNKNOWN',
            message: error.message,
          },
        });
        throw error;
      }
    },
  };

  const clearRecord = () => {
    record.operations = [];
    record.startTime = Date.now();
  };

  return {
    fs: mockFs,
    record,
    clearRecord,
  };
}

