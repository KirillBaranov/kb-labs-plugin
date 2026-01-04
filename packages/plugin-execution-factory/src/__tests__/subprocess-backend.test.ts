/**
 * @module @kb-labs/plugin-execution-factory/__tests__/subprocess-backend
 *
 * Tests for SubprocessBackend.
 *
 * These tests verify:
 * 1. Basic subprocess execution with IPC
 * 2. Error handling in subprocess
 * 3. Stats tracking
 * 4. Health checks
 * 5. Shutdown behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SubprocessBackend } from '../backends/subprocess.js';
import type { ExecutionRequest, HostType } from '../types.js';
import type { UIFacade, PlatformServices } from '@kb-labs/plugin-contracts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

describe('SubprocessBackend', () => {
  let testDir: string;
  let backend: SubprocessBackend;

  const mockPlatform: PlatformServices = {
    logger: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(function(this: any) { return this; }),
    },
  } as any;

  const mockUIProvider = (hostType: HostType): UIFacade => ({
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    spinner: vi.fn(),
    table: vi.fn(),
    json: vi.fn(),
    newline: vi.fn(),
    divider: vi.fn(),
    box: vi.fn(),
    confirm: vi.fn(async () => true),
    prompt: vi.fn(async () => 'test'),
  });

  // Mock subprocess runner
  const mockRunner = {
    runInSubprocess: vi.fn(),
  };

  beforeEach(() => {
    testDir = join(tmpdir(), `subprocess-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    backend = new SubprocessBackend({
      platform: mockPlatform,
      runner: mockRunner as any,
      uiProvider: mockUIProvider,
    });
  });

  afterEach(async () => {
    await backend.shutdown();
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('execute', () => {
    it('should execute handler successfully in subprocess', async () => {
      // Create test handler
      const handlerPath = join(testDir, 'success-handler.js');
      writeFileSync(
        handlerPath,
        `
        export default {
          execute: async (context, input) => {
            return { success: true, message: 'Subprocess test', input };
          }
        };
        `
      );

      // Mock successful subprocess execution
      mockRunner.runInSubprocess.mockResolvedValueOnce({
        data: { success: true, message: 'Subprocess test', input: { test: 'data' } },
        executionMeta: {
          executionId: 'test-exec-1',
          durationMs: 100,
        },
      });

      const request: ExecutionRequest = {
        executionId: 'test-exec-1',
        descriptor: {
          pluginId: '@kb-labs/test',
          packageRoot: testDir,
          pluginRoot: testDir,
          commandId: 'test:command',
          handlerId: 'test:handler',
          hostType: 'cli',
          currentUser: 'test-user',
          entrypoint: handlerPath,
          permissions: {},
        } as any,
        pluginRoot: testDir,
        handlerRef: 'success-handler.js',
        input: { test: 'data' },
        workspace: { mode: 'local' },
      };

      const result = await backend.execute(request);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({
        success: true,
        message: 'Subprocess test',
        input: { test: 'data' },
      });
      expect(result.metadata?.backend).toBe('subprocess');
      expect(mockRunner.runInSubprocess).toHaveBeenCalledTimes(1);
    });

    it('should handle subprocess errors correctly', async () => {
      const handlerPath = join(testDir, 'error-handler.js');
      writeFileSync(
        handlerPath,
        `
        export default {
          execute: async (context, input) => {
            throw new Error('Subprocess error');
          }
        };
        `
      );

      // Mock subprocess error
      mockRunner.runInSubprocess.mockRejectedValueOnce(new Error('Subprocess error'));

      const request: ExecutionRequest = {
        executionId: 'test-exec-error',
        descriptor: {
          pluginId: '@kb-labs/test',
          packageRoot: testDir,
          pluginRoot: testDir,
          commandId: 'test:error',
          handlerId: 'test:error-handler',
          hostType: 'cli',
          currentUser: 'test-user',
          entrypoint: handlerPath,
          permissions: {},
        } as any,
        pluginRoot: testDir,
        handlerRef: 'error-handler.js',
        input: {},
        workspace: { mode: 'local' },
      };

      const result = await backend.execute(request);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Subprocess error');
    });

    it('should handle missing handler file', async () => {
      const request: ExecutionRequest = {
        executionId: 'test-exec-missing',
        descriptor: {
          pluginId: '@kb-labs/test',
          packageRoot: testDir,
          pluginRoot: testDir,
          commandId: 'test:missing',
          handlerId: 'test:missing-handler',
          hostType: 'cli',
          currentUser: 'test-user',
          entrypoint: join(testDir, 'nonexistent.js'),
          permissions: {},
        } as any,
        pluginRoot: testDir,
        handlerRef: 'nonexistent.js',
        input: {},
        workspace: { mode: 'local' },
      };

      const result = await backend.execute(request);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toMatch(/not found|does not exist/i);
    });
  });

  describe('stats() method', () => {
    it('should track execution statistics', async () => {
      const handlerPath = join(testDir, 'stats-handler.js');
      writeFileSync(
        handlerPath,
        `
        export default {
          execute: async (context, input) => {
            return { result: 'success' };
          }
        };
        `
      );

      mockRunner.runInSubprocess.mockResolvedValue({
        data: { result: 'success' },
        executionMeta: { executionId: 'test', durationMs: 50 },
      });

      const createRequest = (id: string): ExecutionRequest => ({
        executionId: id,
        descriptor: {
          pluginId: '@kb-labs/test',
          packageRoot: testDir,
          pluginRoot: testDir,
          commandId: 'test:stats',
          handlerId: 'test:stats-handler',
          hostType: 'cli',
          currentUser: 'test-user',
          entrypoint: handlerPath,
          permissions: {},
        } as any,
        pluginRoot: testDir,
        handlerRef: 'stats-handler.js',
        input: {},
        workspace: { mode: 'local' },
      });

      // Execute 3 times
      await backend.execute(createRequest('stats-1'));
      await backend.execute(createRequest('stats-2'));
      await backend.execute(createRequest('stats-3'));

      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(3);
      expect(stats.successCount).toBe(3);
      expect(stats.errorCount).toBe(0);
    });

    it('should count errors in statistics', async () => {
      const handlerPath = join(testDir, 'error-stats-handler.js');
      writeFileSync(
        handlerPath,
        `
        export default {
          execute: async (context, input) => {
            if (input.shouldFail) throw new Error('Fail');
            return { result: 'success' };
          }
        };
        `
      );

      const createRequest = (id: string, shouldFail: boolean): ExecutionRequest => ({
        executionId: id,
        descriptor: {
          pluginId: '@kb-labs/test',
          packageRoot: testDir,
          pluginRoot: testDir,
          commandId: 'test:error-stats',
          handlerId: 'test:error-stats-handler',
          hostType: 'cli',
          currentUser: 'test-user',
          entrypoint: handlerPath,
          permissions: {},
        } as any,
        pluginRoot: testDir,
        handlerRef: 'error-stats-handler.js',
        input: { shouldFail },
        workspace: { mode: 'local' },
      });

      // Mock: 2 success, 1 error
      mockRunner.runInSubprocess
        .mockResolvedValueOnce({ data: { result: 'success' }, executionMeta: { executionId: 'e1', durationMs: 50 } })
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ data: { result: 'success' }, executionMeta: { executionId: 'e3', durationMs: 50 } });

      await backend.execute(createRequest('e-stats-1', false));
      await backend.execute(createRequest('e-stats-2', true));
      await backend.execute(createRequest('e-stats-3', false));

      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(3);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(1);
    });
  });

  describe('health() method', () => {
    it('should return healthy status', async () => {
      const health = await backend.health();

      expect(health.healthy).toBe(true);
      expect(health.backend).toBe('subprocess');
      expect(health.details).toBeDefined();
      expect(health.details?.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await expect(backend.shutdown()).resolves.toBeUndefined();
    });
  });
});
