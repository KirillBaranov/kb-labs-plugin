/**
 * @module @kb-labs/plugin-execution/__tests__/in-process-backend
 *
 * Tests for InProcessBackend - the Level 0 execution backend.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExecutionRequest, HostType } from '../types.js';
import type { PlatformServices, PluginContextDescriptor, UIFacade } from '@kb-labs/plugin-contracts';
import { noopUI, DEFAULT_PERMISSIONS } from '@kb-labs/plugin-contracts';
import * as path from 'node:path';

// Mock fs module - factory runs before hoisted imports
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  default: { existsSync: vi.fn(() => true) },
}));

// Mock runInProcess from plugin-runtime
vi.mock('@kb-labs/plugin-runtime', () => ({
  runInProcess: vi.fn(),
}));

// Import after mocks are set up
import { InProcessBackend } from '../backends/in-process.js';
import { existsSync } from 'node:fs';
import { runInProcess } from '@kb-labs/plugin-runtime';

// Get typed mocks
const mockedExistsSync = vi.mocked(existsSync);
const mockedRunInProcess = vi.mocked(runInProcess);

// Helper to create a valid mock RunResult<T> in v5 format
function createMockResult<T = unknown>(overrides?: {
  data?: T;
  executionMeta?: Record<string, unknown>;
}) {
  return {
    data: overrides?.data,
    executionMeta: {
      pluginId: '@test/plugin',
      pluginVersion: '1.0.0',
      handlerId: 'test-handler',
      requestId: 'req-123',
      startTime: Date.now(),
      endTime: Date.now() + 10,
      durationMs: 10,
      ...overrides?.executionMeta,
    },
  };
}

describe('InProcessBackend', () => {
  // Mock platform services
  const mockPlatform: PlatformServices = {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn(),
      child: vi.fn().mockReturnThis(),
    },
    llm: {
      complete: vi.fn(),
      stream: vi.fn(),
    },
    cache: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    },
    embeddings: {
      embed: vi.fn(),
      embedBatch: vi.fn(),
    },
    vectorStore: {
      upsert: vi.fn(),
      search: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
    },
    storage: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      exists: vi.fn(),
    },
    analytics: {
      track: vi.fn(),
      identify: vi.fn(),
      flush: vi.fn(),
    },
  };

  // Create test descriptor
  const createDescriptor = (host: HostType = 'rest'): PluginContextDescriptor => ({
    hostType: host,
    pluginId: '@test/plugin',
    pluginVersion: '1.0.0',
    requestId: 'req-123',
    permissions: DEFAULT_PERMISSIONS,
    hostContext: {
      host: 'rest',
      method: 'POST',
      path: '/test',
      headers: {},
    },
  });

  // Create test request
  const createRequest = (overrides?: Partial<ExecutionRequest>): ExecutionRequest => ({
    executionId: 'exec-123',
    descriptor: createDescriptor(),
    pluginRoot: '/test/plugins/my-plugin',
    handlerRef: './dist/handler.js',
    input: { foo: 'bar' },
    workspace: {
      type: 'local',
      cwd: '/test/workspace',
    },
    timeoutMs: 30000,
    ...overrides,
  });

  let backend: InProcessBackend;

  beforeEach(() => {
    vi.clearAllMocks();

    backend = new InProcessBackend({
      platform: mockPlatform,
    });

    // Mock fs.existsSync to return true by default
    mockedExistsSync.mockReturnValue(true);
  });

  describe('constructor', () => {
    it('should create backend with platform', () => {
      const backend = new InProcessBackend({ platform: mockPlatform });
      expect(backend).toBeDefined();
    });

    it('should create backend with custom uiProvider', () => {
      const customUI: UIFacade = { ...noopUI };
      const uiProvider = vi.fn().mockReturnValue(customUI);

      const backend = new InProcessBackend({
        platform: mockPlatform,
        uiProvider,
      });

      expect(backend).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should execute handler successfully', async () => {
      mockedRunInProcess.mockResolvedValue(
        createMockResult({ data: { success: true, data: 'test' } })
      );

      const request = createRequest();
      const result = await backend.execute(request);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ success: true, data: 'test' });
      expect(result.executionTimeMs).toBeGreaterThan(0);
      expect(result.metadata?.backend).toBe('in-process');
      expect(result.metadata?.workspaceId).toBeDefined();
    });

    it('should return ok: false when handler throws error', async () => {
      mockedRunInProcess.mockRejectedValue(new Error('Handler failed'));

      const request = createRequest();
      const result = await backend.execute(request);

      expect(result.ok).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeDefined();
    });

    it('should pass descriptor to runInProcess as-is', async () => {
      mockedRunInProcess.mockResolvedValue(createMockResult());

      const descriptor = createDescriptor('cli');
      const request = createRequest({ descriptor });

      await backend.execute(request);

      expect(mockedRunInProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          descriptor, // Exact same object
        })
      );
    });

    it('should resolve handler path correctly', async () => {
      mockedRunInProcess.mockResolvedValue(createMockResult());

      const request = createRequest({
        pluginRoot: '/plugins/my-plugin',
        handlerRef: './dist/handlers/search.js',
      });

      await backend.execute(request);

      const expectedPath = path.resolve('/plugins/my-plugin', './dist/handlers/search.js');
      expect(mockedRunInProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          handlerPath: expectedPath,
        })
      );
    });

    it('should return error when handler file does not exist', async () => {
      mockedExistsSync.mockReturnValue(false);

      const request = createRequest();
      const result = await backend.execute(request);

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('HANDLER_NOT_FOUND');
      expect(result.error?.message).toContain('handler.js');
    });

    it('should return error when signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const request = createRequest();
      const result = await backend.execute(request, { signal: controller.signal });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('ABORTED');
      expect(result.error?.message).toContain('aborted before start');
    });

    it('should pass signal to runInProcess', async () => {
      mockedRunInProcess.mockResolvedValue(createMockResult());

      const controller = new AbortController();
      const request = createRequest();

      await backend.execute(request, { signal: controller.signal });

      expect(mockedRunInProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          signal: controller.signal,
        })
      );
    });

    it('should pass input to runInProcess', async () => {
      mockedRunInProcess.mockResolvedValue(createMockResult());

      const input = { query: 'test', limit: 10 };
      const request = createRequest({ input });

      await backend.execute(request);

      expect(mockedRunInProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          input,
        })
      );
    });

    it('should handle runInProcess errors', async () => {
      mockedRunInProcess.mockRejectedValue(new Error('Runtime error'));

      const request = createRequest();
      const result = await backend.execute(request);

      expect(result.ok).toBe(false);
      expect(result.error?.message).toBe('Runtime error');
      // normalizeError uses HANDLER_ERROR for Error instances
      expect(result.error?.code).toBe('HANDLER_ERROR');
    });

    it('should use uiProvider based on host type', async () => {
      mockedRunInProcess.mockResolvedValue(createMockResult());

      const cliUI: UIFacade = { ...noopUI };
      const restUI: UIFacade = { ...noopUI };
      const uiProvider = vi.fn((host: HostType) => (host === 'cli' ? cliUI : restUI));

      const backend = new InProcessBackend({
        platform: mockPlatform,
        uiProvider,
      });

      // Execute with CLI descriptor
      const cliRequest = createRequest({ descriptor: createDescriptor('cli') });
      await backend.execute(cliRequest);

      expect(uiProvider).toHaveBeenCalledWith('cli');
      expect(mockedRunInProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          ui: cliUI,
        })
      );

      // Execute with REST descriptor
      const restRequest = createRequest({ descriptor: createDescriptor('rest') });
      await backend.execute(restRequest);

      expect(uiProvider).toHaveBeenCalledWith('rest');
    });
  });

  describe('stats', () => {
    it('should return initial stats', async () => {
      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.avgExecutionTimeMs).toBe(0);
    });

    it('should track successful executions', async () => {
      mockedRunInProcess.mockResolvedValue(createMockResult());

      await backend.execute(createRequest());
      await backend.execute(createRequest());

      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(2);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(0);
    });

    it('should track failed executions (handler throws)', async () => {
      mockedRunInProcess.mockRejectedValue(new Error('Handler failed'));

      await backend.execute(createRequest());

      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(1);
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(1);
    });

    it('should track errors (exceptions)', async () => {
      mockedRunInProcess.mockRejectedValue(new Error('Crash'));

      await backend.execute(createRequest());

      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(1);
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(1);
    });

    it('should calculate average execution time', async () => {
      mockedRunInProcess.mockResolvedValue(createMockResult());

      await backend.execute(createRequest());
      await backend.execute(createRequest());
      await backend.execute(createRequest());

      const stats = await backend.stats();

      expect(stats.avgExecutionTimeMs).toBeGreaterThan(0);
    });

    it('should return copy of stats (not reference)', async () => {
      const stats1 = await backend.stats();
      const stats2 = await backend.stats();

      expect(stats1).not.toBe(stats2);
      expect(stats1).toEqual(stats2);
    });
  });

  describe('health', () => {
    it('should return healthy status', async () => {
      const health = await backend.health();

      expect(health.healthy).toBe(true);
      expect(health.backend).toBe('in-process');
      expect(health.details?.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should track uptime', async () => {
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));

      const health = await backend.health();

      expect(health.details?.uptimeMs).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('should complete without error', async () => {
      await expect(backend.shutdown()).resolves.not.toThrow();
    });
  });

  describe('workspace leasing', () => {
    it('should include workspaceId in result metadata', async () => {
      mockedRunInProcess.mockResolvedValue(createMockResult());

      const result = await backend.execute(createRequest());

      expect(result.metadata?.workspaceId).toBeDefined();
      expect(typeof result.metadata?.workspaceId).toBe('string');
    });

    it('should include workspaceId even on error', async () => {
      mockedRunInProcess.mockRejectedValue(new Error('Crash'));

      const result = await backend.execute(createRequest());

      expect(result.metadata?.workspaceId).toBeDefined();
    });
  });
});
