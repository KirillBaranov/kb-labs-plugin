/**
 * @module @kb-labs/plugin-execution/backends/worker-pool/pool
 *
 * WorkerPool - manages pool of workers with bounded queue.
 * Handles worker lifecycle, request queuing, and load balancing.
 */

import { EventEmitter } from 'node:events';
import type {
  WorkerPoolConfig,
  QueuedRequest,
  WorkerPoolStats,
} from './types.js';
import { Worker } from './worker.js';
import type { ExecutionRequest, ExecutionResult } from '../../types.js';
import {
  QueueFullError,
  AcquireTimeoutError,
  WorkerCrashedError,
} from '../../errors.js';
import { normalizeError } from '../../utils.js';

/**
 * Pool events.
 */
export interface PoolEvents {
  workerSpawned: [worker: Worker];
  workerExited: [worker: Worker, code: number | null];
  workerRecycled: [worker: Worker];
  queueFull: [queueSize: number];
  healthCheckFailed: [worker: Worker];
}

/**
 * WorkerPool - manages a pool of worker processes.
 *
 * Features:
 * - Bounded queue with QUEUE_FULL error when at capacity
 * - Acquire timeout for getting available worker
 * - Per-plugin concurrency limits
 * - Worker recycling (max requests, max uptime)
 * - Health checks with automatic worker replacement
 * - Graceful shutdown
 */
export class WorkerPool extends EventEmitter<PoolEvents> {
  private readonly config: WorkerPoolConfig;
  private readonly workerScript: string;
  private readonly workers = new Map<string, Worker>();
  private readonly queue: QueuedRequest[] = [];
  private readonly pluginConcurrency = new Map<string, number>();

  // Statistics
  private stats: WorkerPoolStats = {
    totalWorkers: 0,
    workersByState: {
      starting: 0,
      idle: 0,
      busy: 0,
      draining: 0,
      stopped: 0,
    },
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

  private queueWaitTimes: number[] = [];
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;
  private startTime = Date.now();

  constructor(
    workerScript: string,
    config: Partial<WorkerPoolConfig> = {}
  ) {
    super();
    this.workerScript = workerScript;
    this.config = {
      min: config.min ?? 2,
      max: config.max ?? 10,
      maxRequestsPerWorker: config.maxRequestsPerWorker ?? 1000,
      maxUptimeMsPerWorker: config.maxUptimeMsPerWorker ?? 30 * 60 * 1000,
      maxQueueSize: config.maxQueueSize ?? 100,
      acquireTimeoutMs: config.acquireTimeoutMs ?? 5000,
      maxConcurrentPerPlugin: config.maxConcurrentPerPlugin,
      healthCheckIntervalMs: config.healthCheckIntervalMs ?? 10_000,
      warmup: config.warmup ?? {
        mode: 'none',
        topN: 5,
        maxHandlers: 20,
      },
    };
  }

  /**
   * Start the pool - spawn initial workers.
   */
  async start(): Promise<void> {
    const spawnPromises: Promise<void>[] = [];

    for (let i = 0; i < this.config.min; i++) {
      spawnPromises.push(this.spawnWorker());
    }

    await Promise.all(spawnPromises);

    // Start health check interval
    this.healthCheckInterval = setInterval(
      () => this.runHealthChecks(),
      this.config.healthCheckIntervalMs
    );
  }

  /**
   * Execute request using pool.
   *
   * Flow:
   * 1. Check per-plugin concurrency
   * 2. Check queue capacity
   * 3. Try to get available worker
   * 4. If no worker, queue request
   * 5. Wait for result or timeout
   */
  async execute(
    request: ExecutionRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ExecutionResult> {
    if (this.isShuttingDown) {
      return {
        ok: false,
        error: { message: 'Pool is shutting down', code: 'ABORTED' },
        executionTimeMs: 0,
      };
    }

    const pluginId = request.descriptor.pluginId;
    const timeoutMs = request.timeoutMs ?? 30_000;
    const startTime = performance.now();

    // Check per-plugin concurrency
    if (this.config.maxConcurrentPerPlugin) {
      const current = this.pluginConcurrency.get(pluginId) ?? 0;
      if (current >= this.config.maxConcurrentPerPlugin) {
        this.stats.queueFullRejections++;
        return {
          ok: false,
          error: normalizeError(new QueueFullError(current, this.config.maxConcurrentPerPlugin)),
          executionTimeMs: performance.now() - startTime,
        };
      }
    }

    // Check abort signal
    if (options?.signal?.aborted) {
      return {
        ok: false,
        error: { message: 'Request aborted', code: 'ABORTED' },
        executionTimeMs: performance.now() - startTime,
      };
    }

    // Increment plugin concurrency
    this.incrementPluginConcurrency(pluginId);

    try {
      // Try to get available worker immediately
      const worker = this.getAvailableWorker();

      if (worker) {
        return await this.executeOnWorker(worker, request, timeoutMs, startTime);
      }

      // Check queue capacity
      if (this.queue.length >= this.config.maxQueueSize) {
        this.stats.queueFullRejections++;
        this.emit('queueFull', this.queue.length);
        return {
          ok: false,
          error: normalizeError(new QueueFullError(this.queue.length, this.config.maxQueueSize)),
          executionTimeMs: performance.now() - startTime,
        };
      }

      // Scale up if possible
      if (this.workers.size < this.config.max) {
        this.spawnWorker().catch(() => {
          // Ignore spawn errors during scaling
        });
      }

      // Queue the request
      return await this.queueRequest(request, options?.signal, timeoutMs, startTime);
    } finally {
      this.decrementPluginConcurrency(pluginId);
    }
  }

  /**
   * Get pool statistics.
   */
  getStats(): WorkerPoolStats {
    // Update worker state counts
    const workersByState = {
      starting: 0,
      idle: 0,
      busy: 0,
      draining: 0,
      stopped: 0,
    };

    for (const worker of this.workers.values()) {
      workersByState[worker.state]++;
    }

    return {
      ...this.stats,
      totalWorkers: this.workers.size,
      workersByState,
      queueLength: this.queue.length,
    };
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(timeoutMs = 10_000): Promise<void> {
    this.isShuttingDown = true;

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Reject all queued requests
    for (const queued of this.queue) {
      queued.reject(new Error('Pool shutdown'));
    }
    this.queue.length = 0;

    // Shutdown all workers
    const shutdownPromises = Array.from(this.workers.values()).map(
      (worker) => worker.shutdown(timeoutMs)
    );

    await Promise.allSettled(shutdownPromises);
    this.workers.clear();
  }

  /**
   * Spawn a new worker.
   */
  private async spawnWorker(): Promise<void> {
    const worker = new Worker({
      workerScript: this.workerScript,
    });

    // Setup event handlers
    worker.on('exit', (w, code, signal) => {
      this.handleWorkerExit(w, code, signal);
    });

    worker.on('healthUpdate', (w, healthy) => {
      if (!healthy) {
        this.emit('healthCheckFailed', w);
      }
    });

    this.workers.set(worker.id, worker);

    try {
      await worker.spawn();
      this.emit('workerSpawned', worker);

      // Process queue after worker is ready
      this.processQueue();
    } catch (error) {
      this.workers.delete(worker.id);
      throw error;
    }
  }

  /**
   * Get first available worker.
   */
  private getAvailableWorker(): Worker | null {
    for (const worker of this.workers.values()) {
      if (worker.isAvailable) {
        // Check if worker needs recycling
        if (worker.shouldRecycle(
          this.config.maxRequestsPerWorker,
          this.config.maxUptimeMsPerWorker
        )) {
          this.recycleWorker(worker);
          continue;
        }
        return worker;
      }
    }
    return null;
  }

  /**
   * Execute request on specific worker.
   */
  private async executeOnWorker(
    worker: Worker,
    request: ExecutionRequest,
    timeoutMs: number,
    startTime: number
  ): Promise<ExecutionResult> {
    this.stats.totalRequests++;

    try {
      const result = await worker.execute(request, timeoutMs);

      if (result.ok) {
        this.stats.successCount++;
      } else {
        this.stats.errorCount++;
      }

      // Add worker metadata
      result.metadata = {
        ...result.metadata,
        workerId: worker.id,
        backend: 'worker-pool',
      };

      return result;
    } catch (error) {
      this.stats.errorCount++;

      if (error instanceof WorkerCrashedError) {
        this.stats.workerCrashes++;
      }

      return {
        ok: false,
        error: normalizeError(error),
        executionTimeMs: performance.now() - startTime,
        metadata: {
          workerId: worker.id,
          backend: 'worker-pool',
        },
      };
    }
  }

  /**
   * Queue a request and wait for execution.
   */
  private queueRequest(
    request: ExecutionRequest,
    signal: AbortSignal | undefined,
    timeoutMs: number,
    startTime: number
  ): Promise<ExecutionResult> {
    return new Promise<ExecutionResult>((resolve, reject) => {
      const queuedAt = Date.now();

      // Acquire timeout
      const acquireTimeout = setTimeout(() => {
        // Remove from queue
        const idx = this.queue.findIndex((q) => q.id === request.executionId);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }

        this.stats.acquireTimeouts++;
        resolve({
          ok: false,
          error: normalizeError(new AcquireTimeoutError(this.config.acquireTimeoutMs)),
          executionTimeMs: performance.now() - startTime,
        });
      }, this.config.acquireTimeoutMs);

      // Abort handler
      const onAbort = () => {
        clearTimeout(acquireTimeout);
        const idx = this.queue.findIndex((q) => q.id === request.executionId);
        if (idx !== -1) {
          this.queue.splice(idx, 1);
        }
        resolve({
          ok: false,
          error: { message: 'Request aborted', code: 'ABORTED' },
          executionTimeMs: performance.now() - startTime,
        });
      };

      if (signal) {
        if (signal.aborted) {
          clearTimeout(acquireTimeout);
          resolve({
            ok: false,
            error: { message: 'Request aborted', code: 'ABORTED' },
            executionTimeMs: performance.now() - startTime,
          });
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      // Queue the request
      const queuedRequest: QueuedRequest = {
        id: request.executionId,
        request,
        signal,
        queuedAt,
        resolve: (result) => {
          clearTimeout(acquireTimeout);
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }

          // Track queue wait time
          const waitTime = Date.now() - queuedAt;
          this.trackQueueWaitTime(waitTime);

          resolve(result);
        },
        reject: (error) => {
          clearTimeout(acquireTimeout);
          if (signal) {
            signal.removeEventListener('abort', onAbort);
          }
          reject(error);
        },
      };

      this.queue.push(queuedRequest);
    });
  }

  /**
   * Process queued requests.
   */
  private processQueue(): void {
    while (this.queue.length > 0) {
      const worker = this.getAvailableWorker();
      if (!worker) {
        break;
      }

      const queued = this.queue.shift()!;

      // Skip if aborted
      if (queued.signal?.aborted) {
        queued.resolve({
          ok: false,
          error: { message: 'Request aborted', code: 'ABORTED' },
          executionTimeMs: 0,
        });
        continue;
      }

      const timeoutMs = queued.request.timeoutMs ?? 30_000;
      const startTime = queued.queuedAt;

      this.executeOnWorker(worker, queued.request, timeoutMs, startTime)
        .then((result) => {
          queued.resolve(result);
          // Process more from queue
          this.processQueue();
        })
        .catch((error) => {
          queued.reject(error);
          this.processQueue();
        });
    }
  }

  /**
   * Handle worker exit.
   */
  private handleWorkerExit(
    worker: Worker,
    code: number | null,
    _signal: string | null
  ): void {
    this.workers.delete(worker.id);
    this.emit('workerExited', worker, code);

    // Spawn replacement if not shutting down and below min
    if (!this.isShuttingDown && this.workers.size < this.config.min) {
      this.spawnWorker().catch(() => {
        // Log but don't throw
      });
    }

    // Process queue in case worker freed up work
    this.processQueue();
  }

  /**
   * Recycle worker (replace with fresh one).
   */
  private async recycleWorker(worker: Worker): Promise<void> {
    this.stats.workersRecycled++;
    this.emit('workerRecycled', worker);

    // Gracefully shutdown old worker
    worker.shutdown(5000).catch(() => {});

    // Spawn replacement
    if (!this.isShuttingDown && this.workers.size <= this.config.max) {
      this.spawnWorker().catch(() => {});
    }
  }

  /**
   * Run health checks on all workers.
   */
  private async runHealthChecks(): Promise<void> {
    const workers = Array.from(this.workers.values());

    for (const worker of workers) {
      if (worker.state === 'idle') {
        const healthy = await worker.healthCheck();

        if (!healthy) {
          // Replace unhealthy worker
          this.workers.delete(worker.id);
          worker.kill();

          if (!this.isShuttingDown && this.workers.size < this.config.min) {
            this.spawnWorker().catch(() => {});
          }
        }
      }
    }
  }

  /**
   * Track queue wait time for statistics.
   */
  private trackQueueWaitTime(waitTimeMs: number): void {
    this.queueWaitTimes.push(waitTimeMs);

    // Keep last 1000 samples
    if (this.queueWaitTimes.length > 1000) {
      this.queueWaitTimes.shift();
    }

    // Calculate average
    const sum = this.queueWaitTimes.reduce((a, b) => a + b, 0);
    this.stats.avgQueueWaitMs = sum / this.queueWaitTimes.length;

    // Calculate P99
    if (this.queueWaitTimes.length >= 10) {
      const sorted = [...this.queueWaitTimes].sort((a, b) => a - b);
      this.stats.p99QueueWaitMs = sorted[Math.floor(sorted.length * 0.99)];
    }
  }

  /**
   * Increment plugin concurrency counter.
   */
  private incrementPluginConcurrency(pluginId: string): void {
    const current = this.pluginConcurrency.get(pluginId) ?? 0;
    this.pluginConcurrency.set(pluginId, current + 1);
  }

  /**
   * Decrement plugin concurrency counter.
   */
  private decrementPluginConcurrency(pluginId: string): void {
    const current = this.pluginConcurrency.get(pluginId) ?? 1;
    this.pluginConcurrency.set(pluginId, Math.max(0, current - 1));
  }
}
