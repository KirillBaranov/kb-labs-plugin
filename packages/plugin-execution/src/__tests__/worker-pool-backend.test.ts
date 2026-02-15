/**
 * @module @kb-labs/plugin-execution/__tests__/worker-pool-backend
 *
 * Tests for WorkerPoolBackend - the Level 1 execution backend.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionRequest, HostType } from '../types.js';
import type { PlatformServices, PluginContextDescriptor, UIFacade } from '@kb-labs/plugin-contracts';
import { noopUI, DEFAULT_PERMISSIONS } from '@kb-labs/plugin-contracts';

// Mock WorkerPool - must use factory function to avoid hoisting issues
vi.mock('../backends/worker-pool/pool.js', async () => {
  // Import EventEmitter inside factory to avoid hoisting issues
  const { EventEmitter } = await import('node:events');

  class MockWorkerPool extends EventEmitter {
    private started = false;
    private shutdownCalled = false;
    private stats = {
      totalWorkers: 2,
      workersByState: { starting: 0, idle: 2, busy: 0, draining: 0, stopped: 0 },
      queueLength: 0,
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      acquireTimeouts: 0,
      queueFullRejections: 0,
      workerCrashes: 0,
      workersRecycled: 0,
      avgQueueWaitMs: 0,
    };

    constructor(public workerScript: string, public config: any) {
      super();
    }

    async start() {
      this.started = true;
      this.emit('workerSpawned', { id: 'mock-worker-1' });
      this.emit('workerSpawned', { id: 'mock-worker-2' });
    }

    async execute(request: any, options?: { signal?: AbortSignal }) {
      if (this.shutdownCalled) {
        return {
          ok: false,
          error: { message: 'Pool shutdown', code: 'ABORTED' },
          executionTimeMs: 0,
        };
      }

      if (options?.signal?.aborted) {
        return {
          ok: false,
          error: { message: 'Request aborted', code: 'ABORTED' },
          executionTimeMs: 0,
        };
      }

      this.stats.totalRequests++;
      this.stats.successCount++;

      return {
        ok: true,
        data: { executed: true },
        executionTimeMs: 50,
        metadata: {
          workerId: 'mock-worker-1',
          backend: 'worker-pool',
        },
      };
    }

    getStats() {
      return { ...this.stats };
    }

    async shutdown() {
      this.shutdownCalled = true;
      this.stats.totalWorkers = 0;
    }
  }

  return { WorkerPool: MockWorkerPool };
});

import { WorkerPoolBackend } from '../backends/worker-pool/backend.js';

describe('WorkerPoolBackend', () => {
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
    host,
    pluginId: '@test/plugin',
    pluginVersion: '1.0.0',
    requestId: 'req-123',
    cwd: '/test/workspace',
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

  let backend: WorkerPoolBackend;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (backend) {
      await backend.shutdown();
    }
  });

  describe('constructor', () => {
    it('should create backend with default options', () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });
      expect(backend).toBeDefined();
    });

    it('should create backend with custom options', () => {
      backend = new WorkerPoolBackend({
        platform: mockPlatform,
        min: 4,
        max: 20,
        maxQueueSize: 200,
        acquireTimeoutMs: 10000,
      });
      expect(backend).toBeDefined();
    });

    it('should create backend with custom uiProvider', () => {
      const customUI: UIFacade = { ...noopUI };
      const uiProvider = vi.fn().mockReturnValue(customUI);

      backend = new WorkerPoolBackend({
        platform: mockPlatform,
        uiProvider,
      });

      expect(backend).toBeDefined();
    });
  });

  describe('start', () => {
    it('should start the worker pool', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });

      await backend.start();

      expect(mockPlatform.logger.info).toHaveBeenCalledWith(
        'Worker pool started',
        expect.any(Object)
      );
    });

    it('should be idempotent', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });

      await backend.start();
      await backend.start();

      // Should only log once
      expect(mockPlatform.logger.info).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });
    });

    it('should auto-start pool if not started', async () => {
      const result = await backend.execute(createRequest());

      expect(mockPlatform.logger.info).toHaveBeenCalledWith(
        'Worker pool started',
        expect.any(Object)
      );
      expect(result.ok).toBe(true);
    });

    it('should execute request successfully', async () => {
      await backend.start();

      const result = await backend.execute(createRequest());

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ executed: true });
      expect(result.metadata?.backend).toBe('worker-pool');
    });

    it('should track execution time', async () => {
      await backend.start();

      const result = await backend.execute(createRequest());

      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle aborted requests', async () => {
      await backend.start();

      const controller = new AbortController();
      controller.abort();

      const result = await backend.execute(createRequest(), { signal: controller.signal });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('ABORTED');
    });
  });

  describe('health', () => {
    it('should return unhealthy when not started', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });

      const health = await backend.health();

      expect(health.healthy).toBe(false);
      expect(health.backend).toBe('worker-pool');
      expect(health.details?.lastError).toBe('Pool not started');
    });

    it('should return healthy when pool is running', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });
      await backend.start();

      const health = await backend.health();

      expect(health.healthy).toBe(true);
      expect(health.backend).toBe('worker-pool');
      expect(health.details?.workers).toBeDefined();
      expect(health.details?.uptimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('stats', () => {
    it('should return initial stats', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });

      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.errorCount).toBe(0);
      expect(stats.avgExecutionTimeMs).toBe(0);
    });

    it('should track successful executions', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });
      await backend.start();

      await backend.execute(createRequest());
      await backend.execute(createRequest());

      const stats = await backend.stats();

      expect(stats.totalExecutions).toBe(2);
      expect(stats.successCount).toBe(2);
      expect(stats.errorCount).toBe(0);
    });

    it('should calculate average execution time', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });
      await backend.start();

      await backend.execute(createRequest());
      await backend.execute(createRequest());
      await backend.execute(createRequest());

      const stats = await backend.stats();

      expect(stats.avgExecutionTimeMs).toBeGreaterThan(0);
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });
      await backend.start();

      await backend.shutdown();

      expect(mockPlatform.logger.info).toHaveBeenCalledWith('Shutting down worker pool');
    });

    it('should be safe to call multiple times', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });
      await backend.start();

      await backend.shutdown();
      await backend.shutdown();

      // Should only log once
      expect(mockPlatform.logger.info).toHaveBeenCalledWith('Shutting down worker pool');
    });

    it('should be safe to call without start', async () => {
      backend = new WorkerPoolBackend({ platform: mockPlatform });

      await expect(backend.shutdown()).resolves.not.toThrow();
    });
  });
});
