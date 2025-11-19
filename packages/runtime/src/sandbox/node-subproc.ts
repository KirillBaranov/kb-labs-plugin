/**
 * @module @kb-labs/plugin-runtime/sandbox/node-subproc
 * Node subprocess sandbox runner (MVP)
 */

import { fork, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
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
import type { EventEnvelope, EventScope } from '../events/index.js';

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

type EventBridge = {
  dispose(): void;
};

function setupEventBridge(
  child: ChildProcess,
  eventsExt: ExecutionContext['extensions'] extends infer E
    ? E extends { events?: infer V }
      ? V
      : undefined
    : undefined
): EventBridge {
  if (!eventsExt || (typeof eventsExt !== 'object')) {
    return { dispose: () => {} };
  }

  const localBus: any = (eventsExt as any).local;
  const pluginBus: any = (eventsExt as any).plugin;

  const resolveBus = (scope: EventScope): any => {
    if (scope === 'plugin') {
      if (!pluginBus) {
        throw new Error('Plugin scope EventBus not available');
      }
      return pluginBus;
    }
    if (!localBus) {
      throw new Error('Local EventBus not available');
    }
    return localBus;
  };

  const subscriptions = new Map<string, () => void>();

  const sendResponse = (type: string, payload: Record<string, unknown>) => {
    try {
      child.send({ type, payload });
    } catch (error) {
      console.error('[runtime.events] Failed to send IPC response', type, error);
    }
  };

  const messageHandler = async (msg: any) => {
    if (!msg || typeof msg !== 'object') {
      return;
    }

    if (msg.type === 'EVENT_EMIT') {
      const { opId, topic, scope = 'local', payload, options } = msg.payload ?? {};
      if (!opId || typeof topic !== 'string') {
        return;
      }
      try {
        const bus = resolveBus(scope);
        const envelope = await bus.emit(topic, payload, options);
        sendResponse('EVENT_EMIT_RESULT', { opId, ok: true, envelope });
      } catch (error) {
        const err = error as any;
        sendResponse('EVENT_EMIT_RESULT', {
          opId,
          ok: false,
          error: {
            code: err?.code || 'E_EVENT_EMIT_FAILED',
            message: err?.message || 'Event emission failed',
          },
        });
      }
      return;
    }

    if (msg.type === 'EVENT_SUBSCRIBE') {
      const { opId, subscriptionId, topic, scope = 'local', once = false } = msg.payload ?? {};
      if (!subscriptionId || typeof topic !== 'string') {
        return;
      }

      try {
        const bus = resolveBus(scope);
        const handler = (envelope: EventEnvelope) => {
          sendResponse('EVENT_DISPATCH', {
            subscriptionId,
            envelope,
          });
          if (once) {
            subscriptions.delete(subscriptionId);
          }
        };
        const dispose: () => void = once
          ? bus.once(topic, handler)
          : bus.on(topic, handler);
        subscriptions.set(subscriptionId, dispose);
        if (opId) {
          sendResponse('EVENT_SUBSCRIBE_ACK', { opId, ok: true });
        }
      } catch (error) {
        const err = error as any;
        if (opId) {
          sendResponse('EVENT_SUBSCRIBE_ACK', {
            opId,
            ok: false,
            error: {
              code: err?.code || 'E_EVENT_SUBSCRIBE_FAILED',
              message: err?.message || 'Event subscription failed',
            },
          });
        }
      }
      return;
    }

    if (msg.type === 'EVENT_UNSUBSCRIBE') {
      const { opId, subscriptionId } = msg.payload ?? {};
      if (!subscriptionId) {
        return;
      }

      const dispose = subscriptions.get(subscriptionId);
      if (dispose) {
        try {
          dispose();
        } catch {
          // ignore
        }
        subscriptions.delete(subscriptionId);
      }

      if (opId) {
        sendResponse('EVENT_UNSUBSCRIBE_ACK', { opId, ok: true });
      }
      return;
    }
  };

  child.on('message', messageHandler);

  return {
    dispose: () => {
      for (const dispose of subscriptions.values()) {
        try {
          dispose();
        } catch {
          // ignore
        }
      }
      subscriptions.clear();
      if (typeof child.off === 'function') {
        child.off('message', messageHandler);
      } else {
        child.removeListener('message', messageHandler);
      }
    },
  };
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
 * Find workspace root by looking for kb-labs-core directory (most reliable)
 * Falls back to pnpm-workspace.yaml if kb-labs-core not found
 */
function findWorkspaceRoot(startDir: string): string | null {
  let currentDir = path.resolve(startDir);
  for (let i = 0; i < 20; i++) {
    // Check for kb-labs-core directory first (most reliable indicator of monorepo root)
    if (existsSync(path.join(currentDir, 'kb-labs-core'))) {
      return currentDir;
    }
    // Check for pnpm-workspace.yaml (monorepo root)
    if (existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      // Verify that kb-labs-core exists at this level (to avoid false positives)
      if (existsSync(path.join(currentDir, 'kb-labs-core'))) {
        return currentDir;
      }
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  return null;
}

/**
 * Get bootstrap file path using simple path resolution
 * Checks known paths in order of preference
 */
function getBootstrapPath(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cwd = process.cwd();
  
  // Find workspace root
  const workspaceRoot = findWorkspaceRoot(cwd) || findWorkspaceRoot(__dirname);
  
  // 1. Try workspace root (most reliable for monorepo)
  if (workspaceRoot) {
    const workspacePath = path.join(workspaceRoot, 'kb-labs-core', 'packages', 'sandbox', 'dist', 'runner', 'bootstrap.js');
    if (existsSync(workspacePath)) {
      return workspacePath;
    }
  }
  
  // 2. Try relative to current file (if we're in plugin-runtime/dist/sandbox, bootstrap is in child/)
  const relativePath = path.join(__dirname, 'child', 'bootstrap.js');
  if (existsSync(relativePath)) {
    return relativePath;
  }
  
  // 3. Try node_modules (for production builds)
  // Traverse up from current file to find node_modules
  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    const nodeModulesPath = path.join(currentDir, 'node_modules', '@kb-labs', 'sandbox', 'dist', 'runner', 'bootstrap.js');
    if (existsSync(nodeModulesPath)) {
      return nodeModulesPath;
    }
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  
  // If nothing found, throw clear error
  const workspacePath = workspaceRoot
    ? path.join(workspaceRoot, 'kb-labs-core', 'packages', 'sandbox', 'dist', 'runner', 'bootstrap.js')
    : path.join(cwd, 'kb-labs-core', 'packages', 'sandbox', 'dist', 'runner', 'bootstrap.js');
  
  throw new Error(
    `Bootstrap file not found. Tried:\n` +
    `  - ${workspacePath}\n` +
    `  - ${relativePath}\n` +
    `  - node_modules/@kb-labs/sandbox/dist/runner/bootstrap.js\n` +
    `Make sure @kb-labs/sandbox is built: run 'pnpm build' in kb-labs-core/packages/sandbox`
  );
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
          args.artifactBroker,
          args.shellBroker
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

      const eventBridge = setupEventBridge(child, ctx.extensions?.events as any);

      // Setup log collection
      const logBuffer = setupLogPipes(child, ctx);

      // Start timeout watch
      const timeoutMs = perms.quotas?.timeoutMs ?? 60000;
      const timeoutHandle = startTimeoutWatch(child, timeoutMs);

      // Send execution request
      const ctxForChild: any = {
        ...ctx,
        tmpFiles: [],
      };

      if (ctx.extensions) {
        ctxForChild.extensions = { ...ctx.extensions };
        if ((ctx.extensions as any).events) {
          ctxForChild.extensions.events = {
            hasLocal: Boolean((ctx.extensions as any).events.local),
            hasPlugin: Boolean((ctx.extensions as any).events.plugin),
            config: (ctx.extensions as any).events.config,
          };
        }
      }

      child.send({
        type: 'RUN',
        payload: {
          handlerRef: handler,
          input,
          perms,
          ctx: ctxForChild,
        },
      });

      // Wait for result
      return new Promise<ExecuteResult>((resolve) => {
        const cleanup = () => {
          clearTimeout(timeoutHandle);
          if (!child.killed) {
            child.kill();
          }
          eventBridge.dispose();
        };

        // Map for pending confirmation requests
        const pendingConfirmations = new Map<string, {
          resolve: (confirmed: boolean) => void;
          timeout: NodeJS.Timeout;
        }>();

        child.on('message', async (msg: { type: string; payload?: any }) => {
          // Handle shell confirmation requests
          if (msg?.type === 'SHELL_CONFIRM_REQUEST' && msg.payload) {
            const { opId, message: confirmMessage } = msg.payload;
            if (!opId) return;

            // Get presenter from context (if available)
            const presenter = (ctx as any).pluginContext?.presenter;
            let confirmed = false;

            if (presenter?.confirm) {
              try {
                confirmed = await presenter.confirm(confirmMessage, {
                  timeoutMs: 30000,
                  default: false,
                });
              } catch {
                confirmed = false;
              }
            } else {
              // Fallback: default deny if no presenter
              confirmed = false;
            }

            // Send response
            try {
              child.send({
                type: 'SHELL_CONFIRM_RESPONSE',
                payload: {
                  opId,
                  confirmed,
                },
              });
            } catch {
              // Child process may have exited
            }
            return;
          }

          if (msg?.type === 'OK' && msg.payload) {
            cleanup();
            // Clean up any pending confirmations
            for (const { timeout } of pendingConfirmations.values()) {
              clearTimeout(timeout);
            }
            pendingConfirmations.clear();

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
          // Clean up any pending confirmations
          for (const { timeout } of pendingConfirmations.values()) {
            clearTimeout(timeout);
          }
          pendingConfirmations.clear();
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

