/**
 * @module @kb-labs/plugin-execution/__tests__/worker
 *
 * Tests for Worker class - subprocess management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock child_process.fork
const mockProcess = new EventEmitter() as EventEmitter & {
  pid: number;
  send: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
};
mockProcess.pid = 12345;
mockProcess.send = vi.fn();
mockProcess.kill = vi.fn();

vi.mock('node:child_process', () => ({
  fork: vi.fn(() => mockProcess),
}));

import { Worker } from '../backends/worker-pool/worker.js';
import { fork } from 'node:child_process';

const mockedFork = vi.mocked(fork);

describe('Worker', () => {
  let worker: Worker;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock process
    mockProcess.removeAllListeners();
    mockProcess.send = vi.fn();
    mockProcess.kill = vi.fn();

    worker = new Worker({
      workerScript: '/path/to/worker-script.js',
      startupTimeoutMs: 1000,
      healthCheckTimeoutMs: 500,
    });
  });

  afterEach(() => {
    worker.kill();
  });

  describe('constructor', () => {
    it('should create worker with unique ID', () => {
      expect(worker.id).toMatch(/^worker_[a-f0-9]{8}$/);
    });

    it('should start in stopped state', () => {
      expect(worker.state).toBe('stopped');
    });

    it('should not be available initially', () => {
      expect(worker.isAvailable).toBe(false);
    });

    it('should have info with initial values', () => {
      const info = worker.info;
      expect(info.state).toBe('stopped');
      expect(info.requestCount).toBe(0);
      expect(info.healthy).toBe(false);
    });
  });

  describe('spawn', () => {
    it('should fork a child process', async () => {
      const spawnPromise = worker.spawn();

      // Simulate ready message
      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);

      await spawnPromise;

      expect(mockedFork).toHaveBeenCalledWith(
        '/path/to/worker-script.js',
        [],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: expect.objectContaining({
            KB_WORKER_ID: worker.id,
          }),
        })
      );
    });

    it('should transition to idle state after ready', async () => {
      const spawnPromise = worker.spawn();

      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);

      await spawnPromise;

      expect(worker.state).toBe('idle');
      expect(worker.info.healthy).toBe(true);
    });

    it('should emit ready event', async () => {
      const readyHandler = vi.fn();
      worker.on('ready', readyHandler);

      const spawnPromise = worker.spawn();

      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);

      await spawnPromise;

      expect(readyHandler).toHaveBeenCalledWith(worker);
    });

    it('should reject if already spawning', async () => {
      const spawnPromise = worker.spawn();

      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);

      await expect(worker.spawn()).rejects.toThrow('Cannot spawn worker in state: starting');

      await spawnPromise;
    });

    it('should timeout if no ready message', async () => {
      await expect(worker.spawn()).rejects.toThrow(/failed to start within/);
    }, 5000);

    it('should handle process error', async () => {
      const spawnPromise = worker.spawn();

      setTimeout(() => {
        mockProcess.emit('error', new Error('Fork failed'));
      }, 10);

      await expect(spawnPromise).rejects.toThrow('Fork failed');
      expect(worker.state).toBe('stopped');
    });
  });

  describe('execute', () => {
    beforeEach(async () => {
      const spawnPromise = worker.spawn();
      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);
      await spawnPromise;
    });

    it('should send execute message to worker', async () => {
      const request = {
        executionId: 'exec-123',
        descriptor: {
          host: 'rest' as const,
          pluginId: '@test/plugin',
          pluginVersion: '1.0.0',
          requestId: 'req-123',
          cwd: '/test',
          permissions: {},
          hostContext: { host: 'rest' as const, method: 'POST', path: '/test', headers: {} },
        },
        pluginRoot: '/plugins/test',
        handlerRef: './handler.js',
        input: { foo: 'bar' },
      };

      const executePromise = worker.execute(request, 5000);

      // Simulate result
      setTimeout(() => {
        mockProcess.emit('message', {
          type: 'result',
          requestId: 'exec-123',
          result: { ok: true, data: { success: true }, executionTimeMs: 10 },
        });
      }, 10);

      const result = await executePromise;

      expect(mockProcess.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'execute',
          requestId: 'exec-123',
          request,
          timeoutMs: 5000,
        })
      );
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ success: true });
    });

    it('should transition to busy state during execution', async () => {
      const request = {
        executionId: 'exec-busy',
        descriptor: {
          host: 'rest' as const,
          pluginId: '@test/plugin',
          pluginVersion: '1.0.0',
          requestId: 'req-123',
          cwd: '/test',
          permissions: {},
          hostContext: { host: 'rest' as const, method: 'POST', path: '/test', headers: {} },
        },
        pluginRoot: '/plugins/test',
        handlerRef: './handler.js',
        input: {},
      };

      const executePromise = worker.execute(request, 5000);

      expect(worker.state).toBe('busy');
      expect(worker.info.currentExecutionId).toBe('exec-busy');

      // Complete execution
      mockProcess.emit('message', {
        type: 'result',
        requestId: 'exec-busy',
        result: { ok: true, executionTimeMs: 10 },
      });

      await executePromise;

      expect(worker.state).toBe('idle');
      expect(worker.info.currentExecutionId).toBeUndefined();
    });

    it('should increment request count', async () => {
      expect(worker.info.requestCount).toBe(0);

      const request = {
        executionId: 'exec-count',
        descriptor: {
          host: 'rest' as const,
          pluginId: '@test/plugin',
          pluginVersion: '1.0.0',
          requestId: 'req-123',
          cwd: '/test',
          permissions: {},
          hostContext: { host: 'rest' as const, method: 'POST', path: '/test', headers: {} },
        },
        pluginRoot: '/plugins/test',
        handlerRef: './handler.js',
        input: {},
      };

      const executePromise = worker.execute(request, 5000);
      mockProcess.emit('message', {
        type: 'result',
        requestId: 'exec-count',
        result: { ok: true, executionTimeMs: 10 },
      });
      await executePromise;

      expect(worker.info.requestCount).toBe(1);
    });

    it('should handle error messages', async () => {
      const request = {
        executionId: 'exec-error',
        descriptor: {
          host: 'rest' as const,
          pluginId: '@test/plugin',
          pluginVersion: '1.0.0',
          requestId: 'req-123',
          cwd: '/test',
          permissions: {},
          hostContext: { host: 'rest' as const, method: 'POST', path: '/test', headers: {} },
        },
        pluginRoot: '/plugins/test',
        handlerRef: './handler.js',
        input: {},
      };

      const executePromise = worker.execute(request, 5000);

      setTimeout(() => {
        mockProcess.emit('message', {
          type: 'error',
          requestId: 'exec-error',
          error: { message: 'Handler failed', code: 'HANDLER_ERROR' },
        });
      }, 10);

      await expect(executePromise).rejects.toThrow('Handler failed');
    });

    it('should timeout if no response', async () => {
      const request = {
        executionId: 'exec-timeout',
        descriptor: {
          host: 'rest' as const,
          pluginId: '@test/plugin',
          pluginVersion: '1.0.0',
          requestId: 'req-123',
          cwd: '/test',
          permissions: {},
          hostContext: { host: 'rest' as const, method: 'POST', path: '/test', headers: {} },
        },
        pluginRoot: '/plugins/test',
        handlerRef: './handler.js',
        input: {},
      };

      await expect(worker.execute(request, 100)).rejects.toThrow(/timed out after 100ms/);
    }, 5000);

    it('should reject if worker not idle', async () => {
      worker.kill();

      const request = {
        executionId: 'exec-notready',
        descriptor: {
          host: 'rest' as const,
          pluginId: '@test/plugin',
          pluginVersion: '1.0.0',
          requestId: 'req-123',
          cwd: '/test',
          permissions: {},
          hostContext: { host: 'rest' as const, method: 'POST', path: '/test', headers: {} },
        },
        pluginRoot: '/plugins/test',
        handlerRef: './handler.js',
        input: {},
      };

      await expect(worker.execute(request, 5000)).rejects.toThrow('not available');
    });
  });

  describe('healthCheck', () => {
    beforeEach(async () => {
      const spawnPromise = worker.spawn();
      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);
      await spawnPromise;
    });

    it('should send health message and return true on response', async () => {
      const healthPromise = worker.healthCheck();

      setTimeout(() => {
        mockProcess.emit('message', {
          type: 'healthOk',
          memoryUsage: { heapUsed: 1000, heapTotal: 2000, rss: 3000 },
          uptime: 100,
        });
      }, 10);

      const result = await healthPromise;

      expect(mockProcess.send).toHaveBeenCalledWith({ type: 'health' });
      expect(result).toBe(true);
      expect(worker.info.healthy).toBe(true);
    });

    it('should return false on timeout', async () => {
      const result = await worker.healthCheck();

      expect(result).toBe(false);
      expect(worker.info.healthy).toBe(false);
    }, 5000);
  });

  describe('shouldRecycle', () => {
    beforeEach(async () => {
      const spawnPromise = worker.spawn();
      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);
      await spawnPromise;
    });

    it('should return false when under limits', () => {
      expect(worker.shouldRecycle(1000, 30 * 60 * 1000)).toBe(false);
    });

    it('should return true when max requests reached', async () => {
      // Simulate many requests
      for (let i = 0; i < 5; i++) {
        const request = {
          executionId: `exec-${i}`,
          descriptor: {
            host: 'rest' as const,
            pluginId: '@test/plugin',
            pluginVersion: '1.0.0',
            requestId: 'req-123',
            cwd: '/test',
            permissions: {},
            hostContext: { host: 'rest' as const, method: 'POST', path: '/test', headers: {} },
          },
          pluginRoot: '/plugins/test',
          handlerRef: './handler.js',
          input: {},
        };
        const p = worker.execute(request, 5000);
        mockProcess.emit('message', {
          type: 'result',
          requestId: `exec-${i}`,
          result: { ok: true, executionTimeMs: 10 },
        });
        await p;
      }

      expect(worker.shouldRecycle(5, 30 * 60 * 1000)).toBe(true);
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      const spawnPromise = worker.spawn();
      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);
      await spawnPromise;
    });

    it('should send shutdown message', async () => {
      const shutdownPromise = worker.shutdown(1000);

      setTimeout(() => {
        mockProcess.emit('exit', 0, null);
      }, 10);

      await shutdownPromise;

      expect(mockProcess.send).toHaveBeenCalledWith({ type: 'shutdown', graceful: true });
    });

    it('should force kill on timeout', async () => {
      await worker.shutdown(100);

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    }, 5000);
  });

  describe('kill', () => {
    beforeEach(async () => {
      const spawnPromise = worker.spawn();
      setTimeout(() => {
        mockProcess.emit('message', { type: 'ready', pid: 12345 });
      }, 10);
      await spawnPromise;
    });

    it('should kill the process', () => {
      worker.kill();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(worker.state).toBe('stopped');
      expect(worker.info.healthy).toBe(false);
    });
  });
});
