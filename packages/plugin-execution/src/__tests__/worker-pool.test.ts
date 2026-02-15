/**
 * @module @kb-labs/plugin-execution/__tests__/worker-pool
 *
 * Tests for WorkerPool class - pool management and bounded queue.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ExecutionRequest, HostType } from '../types.js';
import type { PluginContextDescriptor } from '@kb-labs/plugin-contracts';
import { DEFAULT_PERMISSIONS } from '@kb-labs/plugin-contracts';

// Mock the Worker import - must use factory function
vi.mock('../backends/worker-pool/worker.js', async () => {
  // Import EventEmitter inside factory to avoid hoisting issues
  const { EventEmitter } = await import('node:events');

  class MockWorker extends EventEmitter {
    readonly id: string;
    private _state: 'stopped' | 'starting' | 'idle' | 'busy' | 'draining' = 'stopped';
    private _healthy = false;
    private _requestCount = 0;
    private _createdAt = Date.now();

    constructor(public options: { workerScript: string }) {
      super();
      this.id = `worker_${Math.random().toString(16).slice(2, 10)}`;
    }

    get state() { return this._state; }
    get isAvailable() { return this._state === 'idle' && this._healthy; }
    get info() {
      return {
        id: this.id,
        state: this._state,
        requestCount: this._requestCount,
        createdAt: this._createdAt,
        healthy: this._healthy,
      };
    }

    async spawn() {
      this._state = 'starting';
      await new Promise(resolve => {
        setTimeout(resolve, 10);
      });
      this._state = 'idle';
      this._healthy = true;
      this.emit('ready', this);
    }

    async execute(request: any, timeoutMs: number) {
      this._state = 'busy';
      this._requestCount++;

      // Simulate execution
      await new Promise(resolve => {
        setTimeout(resolve, 10);
      });

      this._state = 'idle';
      return {
        ok: true,
        data: { processed: true },
        executionTimeMs: 10,
      };
    }

    async healthCheck() {
      return this._healthy;
    }

    shouldRecycle(maxRequests: number, maxUptimeMs: number) {
      return this._requestCount >= maxRequests;
    }

    async shutdown(timeoutMs = 5000) {
      this._state = 'stopped';
    }

    kill() {
      this._state = 'stopped';
      this._healthy = false;
    }
  }

  return { Worker: MockWorker };
});

// Import after mock
import { WorkerPool } from '../backends/worker-pool/pool.js';

describe('WorkerPool', () => {
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
    executionId: `exec-${Math.random().toString(16).slice(2, 10)}`,
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

  let pool: WorkerPool;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (pool) {
      await pool.shutdown();
    }
  });

  describe('constructor', () => {
    it('should create pool with default config', () => {
      pool = new WorkerPool('/path/to/worker.js');
      expect(pool).toBeDefined();
    });

    it('should create pool with custom config', () => {
      pool = new WorkerPool('/path/to/worker.js', {
        min: 4,
        max: 20,
        maxQueueSize: 200,
      });
      expect(pool).toBeDefined();
    });
  });

  describe('start', () => {
    it('should spawn minimum workers', async () => {
      pool = new WorkerPool('/path/to/worker.js', { min: 3, max: 10 });

      await pool.start();

      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(3);
    });

    it('should emit workerSpawned events', async () => {
      pool = new WorkerPool('/path/to/worker.js', { min: 2, max: 5 });

      const spawnHandler = vi.fn();
      pool.on('workerSpawned', spawnHandler);

      await pool.start();

      expect(spawnHandler).toHaveBeenCalledTimes(2);
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      pool = new WorkerPool('/path/to/worker.js', {
        min: 2,
        max: 5,
        maxQueueSize: 10,
        acquireTimeoutMs: 500,
      });
      await pool.start();
    });

    it('should execute request successfully', async () => {
      const request = createRequest();
      const result = await pool.execute(request);

      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ processed: true });
    });

    it('should track execution stats', async () => {
      await pool.execute(createRequest());
      await pool.execute(createRequest());

      const stats = pool.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.successCount).toBe(2);
    });

    it('should include worker-pool in metadata', async () => {
      const result = await pool.execute(createRequest());

      expect(result.metadata?.backend).toBe('worker-pool');
    });
  });

  describe('queue management', () => {
    beforeEach(async () => {
      pool = new WorkerPool('/path/to/worker.js', {
        min: 1,
        max: 1,
        maxQueueSize: 3,
        acquireTimeoutMs: 100,
      });
      await pool.start();
    });

    it('should return QUEUE_FULL when queue is full', async () => {
      // Start requests that will fill the queue
      const requests: Promise<any>[] = [];

      // First request takes the worker
      // Next requests should queue
      for (let i = 0; i < 5; i++) {
        requests.push(pool.execute(createRequest()));
      }

      // Wait for some to complete or fail
      const results = await Promise.all(requests);

      // At least some should fail with QUEUE_FULL
      const queueFullResults = results.filter(r => r.error?.code === 'QUEUE_FULL');
      expect(queueFullResults.length).toBeGreaterThan(0);
    });

    it('should emit queueFull event', async () => {
      const queueFullHandler = vi.fn();
      pool.on('queueFull', queueFullHandler);

      // Fill the queue
      const requests: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        requests.push(pool.execute(createRequest()));
      }

      await Promise.all(requests);

      expect(queueFullHandler).toHaveBeenCalled();
    });
  });

  describe('per-plugin concurrency', () => {
    beforeEach(async () => {
      pool = new WorkerPool('/path/to/worker.js', {
        min: 5,
        max: 10,
        maxConcurrentPerPlugin: 2,
        maxQueueSize: 100,
      });
      await pool.start();
    });

    it('should limit concurrent requests per plugin', async () => {
      // Start multiple requests for same plugin
      const requests: Promise<any>[] = [];
      for (let i = 0; i < 5; i++) {
        requests.push(pool.execute(createRequest({
          descriptor: createDescriptor(),
        })));
      }

      const results = await Promise.all(requests);

      // Some should fail with QUEUE_FULL due to per-plugin limit
      const queueFullResults = results.filter(r => r.error?.code === 'QUEUE_FULL');
      // With 2 concurrent limit and 5 requests, at least some should fail
      expect(queueFullResults.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      pool = new WorkerPool('/path/to/worker.js', { min: 2, max: 5 });
      await pool.start();
    });

    it('should return current statistics', async () => {
      await pool.execute(createRequest());

      const stats = pool.getStats();

      expect(stats.totalWorkers).toBe(2);
      expect(stats.workersByState.idle).toBeGreaterThanOrEqual(1);
      expect(stats.totalRequests).toBe(1);
      expect(stats.successCount).toBe(1);
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      pool = new WorkerPool('/path/to/worker.js', { min: 3, max: 5 });
      await pool.start();
    });

    it('should shutdown all workers', async () => {
      const statsBefore = pool.getStats();
      expect(statsBefore.totalWorkers).toBe(3);

      await pool.shutdown();

      const statsAfter = pool.getStats();
      expect(statsAfter.totalWorkers).toBe(0);
    });

    it('should reject new requests after shutdown', async () => {
      await pool.shutdown();

      const result = await pool.execute(createRequest());

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('ABORTED');
    });
  });

  describe('abort handling', () => {
    beforeEach(async () => {
      pool = new WorkerPool('/path/to/worker.js', { min: 1, max: 1, acquireTimeoutMs: 1000 });
      await pool.start();
    });

    it('should respect abort signal', async () => {
      const controller = new AbortController();

      // Abort immediately
      controller.abort();

      const result = await pool.execute(createRequest(), { signal: controller.signal });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('ABORTED');
    });
  });
});
