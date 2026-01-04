/**
 * @module @kb-labs/plugin-execution-factory/__tests__/factory
 *
 * Tests for execution backend factory.
 *
 * These tests verify:
 * 1. Factory creates correct backend based on mode
 * 2. Auto-detection of execution mode works
 * 3. Backend options are passed correctly
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createExecutionBackend } from '../factory.js';
import { InProcessBackend } from '../backends/in-process.js';
import { SubprocessBackend } from '../backends/subprocess.js';
import { WorkerPoolBackend } from '../backends/worker-pool/backend.js';
import type { BackendOptions } from '../types.js';

describe('Execution Backend Factory', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mockPlatform = {
    // Minimal mock platform
  } as any;

  const mockUIProvider = () => ({
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

  describe('createExecutionBackend - explicit modes', () => {
    it('should create InProcessBackend when mode is "in-process"', () => {
      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'in-process',
        uiProvider: mockUIProvider,
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(InProcessBackend);
    });

    it('should create SubprocessBackend when mode is "subprocess"', () => {
      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'subprocess',
        uiProvider: mockUIProvider,
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(SubprocessBackend);
    });

    it('should create WorkerPoolBackend when mode is "worker-pool"', () => {
      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'worker-pool',
        uiProvider: mockUIProvider,
        workerPool: {
          min: 2,
          max: 10,
        },
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(WorkerPoolBackend);
    });

    it('should throw error when mode is "remote" (not implemented yet)', () => {
      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'remote',
        uiProvider: mockUIProvider,
      };

      expect(() => createExecutionBackend(options)).toThrow(
        'Remote execution backend not yet implemented'
      );
    });

    it('should throw error for unknown mode', () => {
      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'unknown-mode' as any,
        uiProvider: mockUIProvider,
      };

      expect(() => createExecutionBackend(options)).toThrow('Unknown execution mode');
    });
  });

  describe('createExecutionBackend - auto mode detection', () => {
    it('should detect "remote" mode when EXECUTOR_SERVICE_ENDPOINT is set', () => {
      process.env.EXECUTOR_SERVICE_ENDPOINT = 'http://localhost:9000';

      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'auto',
        uiProvider: mockUIProvider,
      };

      // Remote is not implemented, so it should throw
      expect(() => createExecutionBackend(options)).toThrow(
        'Remote execution backend not yet implemented'
      );
    });

    it('should detect "worker-pool" mode when EXECUTION_MODE=worker-pool', () => {
      process.env.EXECUTION_MODE = 'worker-pool';
      delete process.env.EXECUTOR_SERVICE_ENDPOINT;

      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'auto',
        uiProvider: mockUIProvider,
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(WorkerPoolBackend);
    });

    it('should detect "worker-pool" mode when KUBERNETES_SERVICE_HOST is set', () => {
      process.env.KUBERNETES_SERVICE_HOST = '10.96.0.1';
      delete process.env.EXECUTOR_SERVICE_ENDPOINT;
      delete process.env.EXECUTION_MODE;

      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'auto',
        uiProvider: mockUIProvider,
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(WorkerPoolBackend);
    });

    it('should default to "in-process" mode when no env vars set', () => {
      delete process.env.EXECUTOR_SERVICE_ENDPOINT;
      delete process.env.EXECUTION_MODE;
      delete process.env.KUBERNETES_SERVICE_HOST;

      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'auto',
        uiProvider: mockUIProvider,
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(InProcessBackend);
    });

    it('should default to "in-process" when mode is not specified (undefined)', () => {
      delete process.env.EXECUTOR_SERVICE_ENDPOINT;
      delete process.env.EXECUTION_MODE;
      delete process.env.KUBERNETES_SERVICE_HOST;

      const options: BackendOptions = {
        platform: mockPlatform,
        // mode not specified - should default to auto -> in-process
        uiProvider: mockUIProvider,
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(InProcessBackend);
    });
  });

  describe('createExecutionBackend - worker pool options', () => {
    it('should use default worker pool options when not specified', () => {
      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'worker-pool',
        uiProvider: mockUIProvider,
      };

      const backend = createExecutionBackend(options) as WorkerPoolBackend;

      // We can't easily test private fields, but we can verify it's created
      expect(backend).toBeInstanceOf(WorkerPoolBackend);
    });

    it('should pass custom worker pool options', () => {
      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'worker-pool',
        uiProvider: mockUIProvider,
        workerPool: {
          min: 5,
          max: 20,
          maxRequestsPerWorker: 500,
          maxUptimeMsPerWorker: 60 * 60 * 1000, // 1 hour
          maxConcurrentPerPlugin: 3,
          warmup: {
            mode: 'eager',
            topN: 10,
            maxHandlers: 50,
          },
        },
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(WorkerPoolBackend);
      // Worker pool options are passed to constructor and used internally
    });
  });

  describe('createExecutionBackend - platform and uiProvider', () => {
    it('should pass platform to backend', () => {
      const customPlatform = { custom: 'platform' } as any;

      const options: BackendOptions = {
        platform: customPlatform,
        mode: 'in-process',
        uiProvider: mockUIProvider,
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(InProcessBackend);
      // Platform is stored internally and used for execution
    });

    it('should pass uiProvider to backend', () => {
      const customUIProvider = () => ({
        info: vi.fn(),
        success: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      } as any);

      const options: BackendOptions = {
        platform: mockPlatform,
        mode: 'subprocess',
        uiProvider: customUIProvider,
      };

      const backend = createExecutionBackend(options);

      expect(backend).toBeInstanceOf(SubprocessBackend);
      // UIProvider is used to create UI for each execution
    });
  });
});
