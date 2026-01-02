/**
 * @module @kb-labs/plugin-execution/backends/in-process
 *
 * InProcessBackend - Level 0 execution.
 * Runs handlers in same process as caller.
 * No isolation, fast, for dev/tests/trusted plugins.
 *
 * ## runInProcess Contract (v5)
 *
 * This backend delegates to `runInProcess()` from @kb-labs/plugin-runtime.
 * The contract is:
 *
 * - Input: handlerPath (absolute), input, descriptor, platform, ui, signal
 * - Output: RunResult<T> { data: T, meta: ExecutionMeta }
 * - Throws: PluginError on handler failure
 *
 * Handler returns raw data (T), runner wraps it in RunResult.
 * Backend passes data to caller; CLI/REST hosts add their own formatting.
 *
 * ## Unified Types (v3)
 *
 * `request.descriptor` is PluginContextDescriptor from plugin-contracts.
 * We pass it to runInProcess() AS-IS - no conversion needed!
 *
 * ## v4 Fixes
 *
 * - executionId: uses request.executionId (not descriptor.requestId)
 * - stats: counts ok correctly based on result.exitCode
 * - uiProvider: supports CLI UI via BackendOptions
 *
 * ## v5 Changes
 *
 * - runInProcess now returns RunResult<T> instead of CommandResultWithMeta
 * - Backend extracts data from RunResult, no exitCode handling
 * - Success is determined by absence of thrown error
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  ExecutionBackend,
  ExecutionRequest,
  ExecutionResult,
  ExecuteOptions,
  HealthStatus,
  ExecutionStats,
  HostType,
} from '../types.js';
import type { PlatformServices, UIFacade } from '@kb-labs/plugin-contracts';
import { noopUI } from '@kb-labs/plugin-contracts';
import { runInProcess } from '@kb-labs/plugin-runtime';
import { localWorkspaceManager } from '../workspace/local.js';
import type { WorkspaceLease } from '../workspace/types.js';
import { normalizeError } from '../utils.js';
import {
  AbortError,
  HandlerNotFoundError,
} from '../errors.js';

/**
 * InProcessBackend options.
 */
export interface InProcessBackendOptions {
  platform: PlatformServices;
  /**
   * UI provider for different host types.
   * Default: always noopUI (silent).
   * For CLI: return real UI when hostType === 'cli'.
   */
  uiProvider?: (hostType: HostType) => UIFacade;
}

/**
 * InProcessBackend - executes handlers in current process.
 */
export class InProcessBackend implements ExecutionBackend {
  private _stats: ExecutionStats = {
    totalExecutions: 0,
    successCount: 0,
    errorCount: 0,
    avgExecutionTimeMs: 0,
  };
  private executionTimes: number[] = [];
  private startTime = Date.now();
  private readonly platform: PlatformServices;
  private readonly uiProvider: (hostType: HostType) => UIFacade;

  constructor(options: InProcessBackendOptions) {
    this.platform = options.platform;
    this.uiProvider = options.uiProvider ?? (() => noopUI);
  }

  async execute(
    request: ExecutionRequest,
    options?: ExecuteOptions
  ): Promise<ExecutionResult> {
    const start = performance.now();
    let lease: WorkspaceLease | undefined;

    try {
      // 1. Check abort before starting
      if (options?.signal?.aborted) {
        throw new AbortError('Execution aborted before start');
      }

      // 2. Lease workspace (trivial for local)
      // NOTE: Uses request.executionId, NOT descriptor.requestId (v4 fix)
      lease = await localWorkspaceManager.lease(request.workspace, {
        executionId: request.executionId,
        pluginRoot: request.pluginRoot,
      });

      // 3. Resolve handler path and verify existence
      // handlerRef format: './path/to/file.js#exportName' or './path/to/file.js'
      const hashIndex = request.handlerRef.indexOf('#');
      const relPath = hashIndex > 0 ? request.handlerRef.slice(0, hashIndex) : request.handlerRef;
      const handlerPath = path.resolve(lease.pluginRoot, relPath);

      if (!fs.existsSync(handlerPath)) {
        throw new HandlerNotFoundError(handlerPath);
      }

      // 4. Get UI based on host type (v4: supports CLI UI)
      const ui = this.uiProvider(request.descriptor.hostType);

      // 5. Execute via runtime
      // NOTE: request.descriptor is PluginContextDescriptor - passed AS-IS!
      // No conversion needed (v3 unified types).
      // v5: runInProcess returns RunResult<T> with raw data
      const runResult = await runInProcess({
        descriptor: request.descriptor,  // Direct pass-through!
        platform: this.platform,
        ui,
        handlerPath,
        input: request.input,
        signal: options?.signal,
        cwd: lease.cwd,           // From WorkspaceLease
        outdir: undefined,        // Optional, defaults to cwd/.kb/output
      });

      // 6. Success is determined by absence of thrown error
      // v5: No exitCode - handlers throw on failure
      const executionTimeMs = performance.now() - start;
      this.updateStats(true, executionTimeMs);

      // 7. Return result with raw data from handler
      return {
        ok: true,
        data: runResult.data,
        executionTimeMs,
        metadata: {
          backend: 'in-process',
          workspaceId: lease.workspaceId,
          // v5: Include execution meta for consumers who need it
          executionMeta: runResult.meta,
        },
      };
    } catch (error) {
      const executionTimeMs = performance.now() - start;
      this.updateStats(false, executionTimeMs);

      return {
        ok: false,
        error: normalizeError(error),
        executionTimeMs,
        metadata: {
          backend: 'in-process',
          workspaceId: lease?.workspaceId,
        },
      };
    } finally {
      // CRITICAL: Always release workspace (even on error)
      if (lease) {
        await localWorkspaceManager.release(lease).catch(() => {
          // Swallow release errors - already handling main error
        });
      }
    }
  }

  // NOTE: v3/v4 - No converter methods needed!
  // - buildRuntimeDescriptor() - REMOVED (descriptor passed as-is)
  // - getHostType() - REMOVED (host field already in descriptor.host)
  // - convertHostContext() - REMOVED (hostContext already in descriptor.hostContext)

  /**
   * Update execution statistics.
   */
  private updateStats(success: boolean, durationMs: number): void {
    this._stats.totalExecutions++;

    if (success) {
      this._stats.successCount++;
    } else {
      this._stats.errorCount++;
    }

    // Track execution times for percentiles (keep last 1000)
    this.executionTimes.push(durationMs);
    if (this.executionTimes.length > 1000) {
      this.executionTimes.shift();
    }

    // Calculate average
    const sum = this.executionTimes.reduce((a, b) => a + b, 0);
    this._stats.avgExecutionTimeMs = sum / this.executionTimes.length;

    // Calculate percentiles
    if (this.executionTimes.length >= 10) {
      const sorted = [...this.executionTimes].sort((a, b) => a - b);
      this._stats.p95ExecutionTimeMs = sorted[Math.floor(sorted.length * 0.95)];
      this._stats.p99ExecutionTimeMs = sorted[Math.floor(sorted.length * 0.99)];
    }
  }

  async health(): Promise<HealthStatus> {
    return {
      healthy: true,
      backend: 'in-process',
      details: {
        uptimeMs: Date.now() - this.startTime,
      },
    };
  }

  async stats(): Promise<ExecutionStats> {
    return { ...this._stats };
  }

  async shutdown(): Promise<void> {
    // No-op for in-process backend
  }
}
