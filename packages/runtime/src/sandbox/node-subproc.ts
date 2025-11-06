/**
 * @module @kb-labs/plugin-runtime/sandbox/node-subproc
 * Node subprocess sandbox runner (MVP)
 */

import { fork, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SandboxRunner } from './runner.js';
import type {
  ExecutionContext,
  ExecuteResult,
  HandlerRef,
  ExecMetrics,
  ErrorEnvelope,
} from '../types.js';
import type { PermissionSpec } from '@kb-labs/plugin-manifest';
import { pickEnv } from '../io/env.js';
import { ErrorCode } from '@kb-labs/api-contracts';
import { toErrorEnvelope } from '../errors.js';

/**
 * Ring buffer for log collection
 */
class RingBuffer {
  private buffer: string[] = [];
  private maxSize: number;
  private currentSize: number = 0;

  constructor(maxSizeBytes: number) {
    this.maxSize = maxSizeBytes;
  }

  append(line: string): void {
    const lineBytes = Buffer.byteLength(line, 'utf8');
    if (this.currentSize + lineBytes > this.maxSize) {
      // Remove oldest entries until we have space
      while (
        this.buffer.length > 0 &&
        this.currentSize + lineBytes > this.maxSize
      ) {
        const removed = this.buffer.shift();
        if (removed) {
          this.currentSize -= Buffer.byteLength(removed, 'utf8');
        }
      }
    }
    this.buffer.push(line);
    this.currentSize += lineBytes;
  }

  getLines(count?: number): string[] {
    if (count === undefined) {
      return [...this.buffer];
    }
    return this.buffer.slice(-count);
  }

  clear(): void {
    this.buffer = [];
    this.currentSize = 0;
  }
}

/**
 * Setup log pipes for child process
 * @param child - Child process
 * @param ctx - Execution context
 * @returns Ring buffer for log collection
 */
function setupLogPipes(
  child: ChildProcess,
  ctx: ExecutionContext
): RingBuffer {
  const ringBuffer = new RingBuffer(1024 * 1024); // 1MB limit

  if (child.stdout) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data: string) => {
      const lines = data.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        ringBuffer.append(`[stdout] ${line}`);
      }
    });
  }

  if (child.stderr) {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data: string) => {
      const lines = data.split('\n').filter((line) => line.trim());
      for (const line of lines) {
        ringBuffer.append(`[stderr] ${line}`);
      }
    });
  }

  // Handle IPC LOG messages
  child.on('message', (msg: { type: string; payload?: any }) => {
    if (msg?.type === 'LOG' && msg.payload) {
      const { level, message, meta } = msg.payload;
      const logLine = `[${level}] ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`;
      ringBuffer.append(logLine);
    }
  });

  return ringBuffer;
}

/**
 * Start timeout watch
 * @param child - Child process
 * @param timeoutMs - Timeout in milliseconds
 * @param graceMs - Grace period for SIGTERM (default: 5000ms)
 * @returns Timeout handle
 */
function startTimeoutWatch(
  child: ChildProcess,
  timeoutMs: number,
  graceMs: number = 5000
): NodeJS.Timeout {
  let sigtermSent = false;

  const timeoutHandle = setTimeout(() => {
    if (!sigtermSent) {
      sigtermSent = true;
      child.kill('SIGTERM');
      
      // Force kill after grace period
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, graceMs);
    }
  }, timeoutMs);

  return timeoutHandle;
}

/**
 * Get bootstrap file path
 * In production, this will be the compiled .js file
 */
function getBootstrapPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  // Use .js extension (compiled output)
  return path.join(__dirname, 'child', 'bootstrap.js');
}

/**
 * Create in-process runner (dev mode - no sandbox)
 * @returns SandboxRunner instance
 */
function createInProcessRunner(): SandboxRunner {
  return {
    async run(args): Promise<ExecuteResult> {
      const { ctx, perms, handler, input } = args;
      const startedAt = Date.now();
      const cpuStart = process.cpuUsage();
      const memStart = process.memoryUsage().rss;

      // Create log buffer for dev mode too
      const devLogs: string[] = [];

      try {
        // In dev mode, load handler directly (no sandbox)
        const handlerPath = path.resolve(ctx.pluginRoot, handler.file);
        const handlerModule = await import(handlerPath);
        const handlerFn = handlerModule[handler.export];

        if (!handlerFn || typeof handlerFn !== 'function') {
          throw new Error(
            `Handler ${handler.export} not found or not a function in ${handler.file}`
          );
        }

        // Build runtime (with shims, but no isolation)
        const { pickEnv } = await import('../io/env.js');
        const { buildRuntime } = await import('./child/runtime.js');
        const env = pickEnv(process.env, perms.env?.allow);
        const runtime = buildRuntime(
          perms,
          ctx,
          env,
          args.manifest,
          args.invokeBroker,
          args.artifactBroker
        );

        // Patch runtime.log to collect logs in dev mode
        const originalLog = runtime.log;
        runtime.log = (level, msg, meta) => {
          devLogs.push(`[${level}] ${msg}${meta ? ` ${JSON.stringify(meta)}` : ''}`);
          originalLog(level, msg, meta);
        };

        // Execute handler
        const result = await handlerFn(input, {
          requestId: ctx.requestId,
          pluginId: ctx.pluginId,
          outdir: ctx.outdir,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          parentSpanId: ctx.parentSpanId,
          runtime,
        });

        const endTime = Date.now();
        const endCpu = process.cpuUsage(cpuStart);
        const cpuMs = (endCpu.user + endCpu.system) / 1000;
        const memMb = (process.memoryUsage().rss - memStart) / 1024 / 1024;

        const executeResult: ExecuteResult = {
          ok: true,
          data: result,
          metrics: {
            timeMs: endTime - startedAt,
            cpuMs,
            memMb,
          },
        };

        // Include logs in debug mode
        if (ctx.debug) {
          executeResult.logs = devLogs;
        }

        return executeResult;
      } catch (error) {
        const endTime = Date.now();
        const endCpu = process.cpuUsage(cpuStart);
        const cpuMs = (endCpu.user + endCpu.system) / 1000;
        const memMb = (process.memoryUsage().rss - memStart) / 1024 / 1024;

        const { toErrorEnvelope } = await import('../errors.js');
        const { ErrorCode } = await import('@kb-labs/api-contracts');

        const errorEnvelope = toErrorEnvelope(
          ErrorCode.INTERNAL,
          500,
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          ctx,
          {
            timeMs: endTime - startedAt,
            cpuMs,
            memMb,
          },
          perms
        );

        const executeResult: ExecuteResult = {
          ok: false,
          error: errorEnvelope,
          metrics: {
            timeMs: endTime - startedAt,
            cpuMs,
            memMb,
          },
        };

        // Include logs in debug mode
        if (ctx.debug) {
          executeResult.logs = devLogs;
        }

        return executeResult;
      }
    },
  };
}

/**
 * Create node subprocess runner
 * @param devMode - If true, run in-process (no fork) for debugging
 * @returns SandboxRunner instance
 */
export function nodeSubprocRunner(devMode: boolean = false): SandboxRunner {
  // Dev mode: run in-process (no sandbox)
  if (devMode || process.env.KB_PLUGIN_DEV_MODE === 'true') {
    return createInProcessRunner();
  }

  return {
    async run(args): Promise<ExecuteResult> {
      const { ctx, perms, handler, input } = args;
      const startedAt = Date.now();
      const cpuStart = process.cpuUsage();
      const memStart = process.memoryUsage().rss;

      // Get memory limit
      const memoryMb = perms.quotas?.memoryMb ?? 512;

      // Prepare environment (whitelisted only)
      const env = pickEnv(process.env, perms.env?.allow);
      env.PLUGIN_ROOT = ctx.pluginRoot;
      env.START_TIME = String(startedAt);

      // Fork bootstrap process
      const child = fork(getBootstrapPath(), [], {
        execArgv: [
          `--max-old-space-size=${memoryMb}`,
          '--no-deprecation',
          '--enable-source-maps',
        ],
        env,
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        cwd: ctx.workdir,
      });

      // Setup log collection
      const logBuffer = setupLogPipes(child, ctx);

      // Start timeout watch
      const timeoutMs = perms.quotas?.timeoutMs ?? 60000;
      const timeoutHandle = startTimeoutWatch(child, timeoutMs);

      // Send execution request
      child.send({
        type: 'RUN',
        payload: {
          handlerRef: handler,
          input,
          perms,
          ctx: {
            ...ctx,
            tmpFiles: [], // Will be populated during execution
          },
        },
      });

      // Wait for result
      return new Promise<ExecuteResult>((resolve) => {
        const cleanup = () => {
          clearTimeout(timeoutHandle);
          if (!child.killed) {
            child.kill();
          }
        };

        child.on('message', (msg: { type: string; payload?: any }) => {
          if (msg?.type === 'OK' && msg.payload) {
            cleanup();
            const { data, metrics } = msg.payload;
            const endTime = Date.now();
            const endCpu = process.cpuUsage(cpuStart);
            const cpuMs = (endCpu.user + endCpu.system) / 1000;
            const memMb = (process.memoryUsage().rss - memStart) / 1024 / 1024;

            const result: ExecuteResult = {
              ok: true,
              data,
              metrics: {
                timeMs: endTime - startedAt,
                cpuMs,
                memMb,
              },
            };

            // Include logs in debug mode
            if (ctx.debug) {
              result.logs = logBuffer.getLines();
            }

            resolve(result);
          } else if (msg?.type === 'ERR' && msg.payload) {
            cleanup();
            const { error, metrics } = msg.payload;
            const endTime = Date.now();
            const endCpu = process.cpuUsage(cpuStart);
            const cpuMs = (endCpu.user + endCpu.system) / 1000;
            const memMb = (process.memoryUsage().rss - memStart) / 1024 / 1024;

            const errorEnvelope: ErrorEnvelope = toErrorEnvelope(
              ErrorCode.PLUGIN_HANDLER_NOT_FOUND,
              500,
              {
                error: error.message,
                handlerRef: handler,
              },
              ctx,
              {
                timeMs: endTime - startedAt,
                cpuMs,
                memMb,
              }
            );

            const result: ExecuteResult = {
              ok: false,
              error: errorEnvelope,
              metrics: {
                timeMs: endTime - startedAt,
                cpuMs,
                memMb,
              },
            };

            // Include logs in debug mode
            if (ctx.debug) {
              result.logs = logBuffer.getLines();
            }

            resolve(result);
          }
        });

        child.on('error', (error: Error) => {
          cleanup();
          const endTime = Date.now();
          const endCpu = process.cpuUsage(cpuStart);
          const cpuMs = (endCpu.user + endCpu.system) / 1000;
          const memMb = (process.memoryUsage().rss - memStart) / 1024 / 1024;

          const errorEnvelope: ErrorEnvelope = toErrorEnvelope(
            ErrorCode.INTERNAL,
            500,
            {
              error: error.message,
            },
            ctx,
            {
              timeMs: endTime - startedAt,
              cpuMs,
              memMb,
            }
          );

          const result: ExecuteResult = {
            ok: false,
            error: errorEnvelope,
            metrics: {
              timeMs: endTime - startedAt,
              cpuMs,
              memMb,
            },
          };

          // Include logs in debug mode
          if (ctx.debug) {
            result.logs = logBuffer.getLines();
          }

          resolve(result);
        });

        child.on('exit', (code: number | null, signal: string | null) => {
          if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
            cleanup();
            const endTime = Date.now();
            const endCpu = process.cpuUsage(cpuStart);
            const cpuMs = (endCpu.user + endCpu.system) / 1000;
            const memMb = (process.memoryUsage().rss - memStart) / 1024 / 1024;

            const errorEnvelope: ErrorEnvelope =
              signal === 'SIGTERM' || signal === 'SIGKILL'
                ? toErrorEnvelope(
                    ErrorCode.PLUGIN_TIMEOUT,
                    504,
                    {
                      timeoutMs,
                      signal,
                    },
                    ctx,
                    {
                      timeMs: endTime - startedAt,
                      cpuMs,
                      memMb,
                    }
                  )
                : toErrorEnvelope(
                    ErrorCode.INTERNAL,
                    500,
                    {
                      exitCode: code,
                      signal,
                    },
                    ctx,
                    {
                      timeMs: endTime - startedAt,
                      cpuMs,
                      memMb,
                    }
                  );

            const result: ExecuteResult = {
              ok: false,
              error: errorEnvelope,
              metrics: {
                timeMs: endTime - startedAt,
                cpuMs,
                memMb,
              },
            };

            // Include logs in debug mode
            if (ctx.debug) {
              result.logs = logBuffer.getLines();
            }

            resolve(result);
          }
        });
      });
    },
  };
}

