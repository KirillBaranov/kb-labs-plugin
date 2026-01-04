/**
 * @module @kb-labs/plugin-execution-factory/__tests__/in-process-backend
 *
 * Tests for InProcessBackend.
 *
 * These tests verify:
 * 1. Basic handler execution in same process
 * 2. Error handling
 * 3. Stats tracking (stats() method)
 * 4. Health checks (health() method)
 * 5. UI provider integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InProcessBackend } from '../backends/in-process.js';
import type { ExecutionRequest, HostType } from '../types.js';
import type { UIFacade, PlatformServices } from '@kb-labs/plugin-contracts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

describe('InProcessBackend', () => {
  let testDir: string;
  let backend: InProcessBackend;

  const mockPlatform: PlatformServices = {
    // Minimal mock platform
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

  beforeEach(() => {
    testDir = join(tmpdir(), `in-process-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    backend = new InProcessBackend({
      platform: mockPlatform,
      uiProvider: mockUIProvider,
    });
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('execute', () => {
    it('should execute handler successfully and return result with ok=true', async () => {
      // Create simple test handler
      const handlerPath = join(testDir, 'success-handler.js');
      writeFileSync(
        handlerPath,
        `
        export default {
          execute: async (context, input) => {
            return { success: true, message: 'Test passed', input };
          }
        };
        `
      );

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
        message: 'Test passed',
        input: { test: 'data' },
      });
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.backend).toBe('in-process');
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle handler errors correctly with ok=false', async () => {
      // Create handler that throws error
      const handlerPath = join(testDir, 'error-handler.js');
      writeFileSync(
        handlerPath,
        `
        export default {
          execute: async (context, input) => {
            throw new Error('Test error from handler');
          }
        };
        `
      );

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
      expect(result.error?.message).toContain('Test error from handler');
    });

    it('should handle missing handler file with ok=false', async () => {
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
          entrypoint: join(testDir, 'nonexistent-handler.js'),
          permissions: {},
        } as any,
        pluginRoot: testDir,
        handlerRef: 'nonexistent-handler.js',
        input: {},
        workspace: { mode: 'local' },
      };

      const result = await backend.execute(request);

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
      // Error should indicate file not found
      expect(result.error?.message).toMatch(/not found|does not exist/i);
    });
  });

  describe('stats() method', () => {
    it('should track execution statistics correctly', async () => {
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

      // Execute multiple times
      await backend.execute(createRequest('stats-1'));
      await backend.execute(createRequest('stats-2'));
      await backend.execute(createRequest('stats-3'));

      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(3);
      expect(stats.successCount).toBe(3);
      expect(stats.errorCount).toBe(0);
      expect(stats.avgExecutionTimeMs).toBeGreaterThan(0);
    });

    it('should count errors in statistics', async () => {
      const handlerPath = join(testDir, 'error-stats-handler.js');
      writeFileSync(
        handlerPath,
        `
        export default {
          execute: async (context, input) => {
            if (input.shouldFail) {
              throw new Error('Intentional failure');
            }
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

      // Execute: 2 success, 1 error
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
      expect(health.backend).toBe('in-process');
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
