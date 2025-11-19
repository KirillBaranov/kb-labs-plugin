/**
 * @module @kb-labs/plugin-runtime/shell/broker
 * Shell broker for safe command execution
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext, ErrorEnvelope } from '../types.js';
import type { PresenterFacade } from '../presenter/presenter-facade.js';
import type {
  ShellCommandSpec,
  ShellExecOptions,
  ShellResult,
  ShellSpawnOptions,
  ShellSpawnResult,
} from './types.js';
import { resolveShellDecision } from './permissions.js';
import { checkDangerousCommand, formatConfirmationMessage } from './dangerous.js';
import { toErrorEnvelope, createErrorContext } from '../errors.js';
import { emitAnalyticsEvent } from '../analytics.js';
import { createRuntimeLogger } from '../logging.js';
import { ErrorCode } from '@kb-labs/api-contracts';
import { execa } from 'execa';
import { spawn as nodeSpawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { pickEnv } from '../io/env.js';

// Error codes for shell operations (using string constants for now)
const SHELL_PERMISSION_DENIED = 'SHELL_PERMISSION_DENIED';
const SHELL_DANGEROUS_DENIED = 'SHELL_DANGEROUS_DENIED';
const SHELL_EXECUTION_FAILED = 'SHELL_EXECUTION_FAILED';
const SHELL_TIMEOUT = 'SHELL_TIMEOUT';

/**
 * Shell broker for safe command execution
 */
export class ShellBroker {
  private activeProcesses: Set<number> = new Set();
  private maxConcurrent: number;

  constructor(
    private callerManifest: ManifestV2,
    private callerCtx: ExecutionContext,
    private presenter?: PresenterFacade
  ) {
    const shellPerms = callerManifest.permissions?.shell;
    this.maxConcurrent = shellPerms?.maxConcurrent ?? 4;
  }

  private createLogger(extra: Record<string, unknown> = {}) {
    return createRuntimeLogger('shell', this.callerCtx, {
      caller: this.callerCtx.pluginId,
      ...extra,
    });
  }

  /**
   * Request confirmation for dangerous command
   */
  private async requestConfirmation(
    spec: ShellCommandSpec,
    reason: string
  ): Promise<boolean> {
    const message = formatConfirmationMessage(spec, reason);

    // Emit analytics event
    await emitAnalyticsEvent('shell.dangerous.prompted', {
      caller: this.callerCtx.pluginId,
      command: spec.command,
      args: spec.args,
      reason,
      traceId: this.callerCtx.traceId,
      spanId: this.callerCtx.spanId,
      requestId: this.callerCtx.requestId,
    });

    // Try presenter first (CLI mode)
    if (this.presenter?.confirm) {
      try {
        const confirmed = await this.presenter.confirm(message, {
          timeoutMs: 30000,
          default: false,
        });

        if (confirmed) {
          await emitAnalyticsEvent('shell.dangerous.confirmed', {
            caller: this.callerCtx.pluginId,
            command: spec.command,
            args: spec.args,
            traceId: this.callerCtx.traceId,
            spanId: this.callerCtx.spanId,
            requestId: this.callerCtx.requestId,
          });
        } else {
          await emitAnalyticsEvent('shell.dangerous.denied', {
            caller: this.callerCtx.pluginId,
            command: spec.command,
            args: spec.args,
            traceId: this.callerCtx.traceId,
            spanId: this.callerCtx.spanId,
            requestId: this.callerCtx.requestId,
          });
        }

        return confirmed;
      } catch (error) {
        // Presenter error - default deny
        const logger = this.createLogger();
        logger.warn('Confirmation request failed', {
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }
    }

    // IPC mode (subprocess) - send IPC message
    if (typeof process.send === 'function') {
      return new Promise<boolean>((resolve) => {
        const opId = `shell-confirm-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timeout = setTimeout(() => {
          resolve(false); // Default deny on timeout
        }, 30000);

        const handler = (msg: any) => {
          if (msg?.type === 'SHELL_CONFIRM_RESPONSE' && msg?.payload?.opId === opId) {
            clearTimeout(timeout);
            process.removeListener('message', handler);
            const confirmed = msg.payload.confirmed === true;
            if (confirmed) {
              emitAnalyticsEvent('shell.dangerous.confirmed', {
                caller: this.callerCtx.pluginId,
                command: spec.command,
                args: spec.args,
              }).catch(() => {});
            } else {
              emitAnalyticsEvent('shell.dangerous.denied', {
                caller: this.callerCtx.pluginId,
                command: spec.command,
                args: spec.args,
              }).catch(() => {});
            }
            resolve(confirmed);
          }
        };

        process.on('message', handler);

        // Type guard for process.send
        if (process.send) {
          process.send({
            type: 'SHELL_CONFIRM_REQUEST',
            payload: {
              opId,
              message,
              command: spec.command,
              args: spec.args,
              reason,
            },
          });
        }
      });
    }

    // No presenter and no IPC - default deny
    await emitAnalyticsEvent('shell.dangerous.denied', {
      caller: this.callerCtx.pluginId,
      command: spec.command,
      args: spec.args,
      reason: 'no presenter available',
    });

    return false;
  }

  /**
   * Execute a shell command
   */
  async exec(
    command: string,
    args: string[],
    options?: ShellExecOptions
  ): Promise<ShellResult> {
    const startTime = Date.now();
    const logger = this.createLogger({ command, args });

    try {
      // Check dry-run mode
      if (this.callerCtx.dryRun) {
        logger.info('DRY RUN: would execute', { command, args });
        await emitAnalyticsEvent('shell.exec.started', {
          caller: this.callerCtx.pluginId,
          command,
          args,
          dryRun: true,
        });

        return {
          ok: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          timingMs: Date.now() - startTime,
        };
      }

      // Build command spec
      const spec: ShellCommandSpec = {
        command,
        args: args || [],
      };

      // 1. Check permissions
      const shellPerms = this.callerManifest.permissions?.shell;
      const permissionCheck = resolveShellDecision(shellPerms, spec);

      if (!permissionCheck.allow) {
        await emitAnalyticsEvent('shell.exec.denied', {
          caller: this.callerCtx.pluginId,
          command,
          args,
          reason: permissionCheck.reason,
          traceId: this.callerCtx.traceId,
          spanId: this.callerCtx.spanId,
          requestId: this.callerCtx.requestId,
        });

        const error = toErrorEnvelope(
          SHELL_PERMISSION_DENIED,
          403,
          {
            command,
            args,
            reason: permissionCheck.reason,
            ...createErrorContext(
              SHELL_PERMISSION_DENIED,
              'shell.exec',
              undefined,
              permissionCheck.reason || 'Permission denied'
            ),
          },
          this.callerCtx,
          { timeMs: Date.now() - startTime },
          this.callerManifest.permissions
        );

        if (permissionCheck.remediation) {
          error.details = {
            ...error.details,
            remediation: permissionCheck.remediation,
          };
        }

        return {
          ok: false,
          exitCode: 1,
          stdout: '',
          stderr: permissionCheck.reason || 'Permission denied',
          timingMs: Date.now() - startTime,
          error,
        };
      }

      // 2. Check dangerous commands
      const dangerousCheck = checkDangerousCommand(shellPerms, spec);
      if (dangerousCheck.requireConfirmation) {
        const confirmed = await this.requestConfirmation(spec, dangerousCheck.reason || 'dangerous command');
        if (!confirmed) {
          await emitAnalyticsEvent('shell.exec.denied', {
            caller: this.callerCtx.pluginId,
            command,
            args,
            reason: 'dangerous command denied by user',
            traceId: this.callerCtx.traceId,
            spanId: this.callerCtx.spanId,
            requestId: this.callerCtx.requestId,
          });

          const error = toErrorEnvelope(
            SHELL_DANGEROUS_DENIED,
            403,
            {
              command,
              args,
              reason: 'Dangerous command denied by user',
              ...createErrorContext(
                SHELL_DANGEROUS_DENIED,
                'shell.exec',
                undefined,
                'User declined dangerous command'
              ),
            },
            this.callerCtx,
            { timeMs: Date.now() - startTime },
            this.callerManifest.permissions
          );

          return {
            ok: false,
            exitCode: 1,
            stdout: '',
            stderr: 'Dangerous command denied by user',
            timingMs: Date.now() - startTime,
            error,
          };
        }
      }

      // 3. Check concurrent process limit
      if (this.activeProcesses.size >= this.maxConcurrent) {
        const error = toErrorEnvelope(
          ErrorCode.PLUGIN_QUOTA_EXCEEDED,
          429,
          {
            message: `Maximum concurrent shell processes (${this.maxConcurrent}) exceeded`,
            current: this.activeProcesses.size,
            max: this.maxConcurrent,
          },
          this.callerCtx,
          { timeMs: Date.now() - startTime }
        );

        return {
          ok: false,
          exitCode: 1,
          stdout: '',
          stderr: 'Too many concurrent processes',
          timingMs: Date.now() - startTime,
          error,
        };
      }

      // 4. Emit started event
      await emitAnalyticsEvent('shell.exec.started', {
        caller: this.callerCtx.pluginId,
        command,
        args,
        traceId: this.callerCtx.traceId,
        spanId: this.callerCtx.spanId,
        requestId: this.callerCtx.requestId,
      });

      // 5. Prepare execution options
      const timeoutMs =
        options?.timeoutMs ??
        shellPerms?.timeoutMs ??
        this.callerManifest.permissions?.quotas?.timeoutMs ??
        30000;

      const cwd = options?.cwd || this.callerCtx.workdir;
      // Filter environment variables according to permissions (security: whitelist only)
      const baseEnv = pickEnv(process.env, this.callerManifest.permissions?.env?.allow);
      const env = {
        ...baseEnv,
        ...(options?.env || {}),
      };

      // 6. Execute command
      let childProcess: ChildProcess | undefined;
      try {
        const execaPromise = execa(command, args, {
          cwd,
          env,
          timeout: timeoutMs,
          signal: options?.signal,
        });

        // Track process (execa doesn't expose pid immediately, so we track the promise)
        const processId = Date.now(); // Temporary ID until we get real PID
        this.activeProcesses.add(processId);

        const result = await execaPromise;

        this.activeProcesses.delete(processId);

        const timingMs = Date.now() - startTime;

        await emitAnalyticsEvent('shell.exec.finished', {
          caller: this.callerCtx.pluginId,
          command,
          args,
          exitCode: result.exitCode,
          timingMs,
          traceId: this.callerCtx.traceId,
          spanId: this.callerCtx.spanId,
          requestId: this.callerCtx.requestId,
        });

        return {
          ok: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: result.stdout || '',
          stderr: result.stderr || '',
          timingMs,
        };
      } catch (error: unknown) {
        if (childProcess?.pid) {
          this.activeProcesses.delete(childProcess.pid);
        }

        const timingMs = Date.now() - startTime;

        // Check if it's a timeout
        if (error && typeof error === 'object' && 'timedOut' in error && error.timedOut) {
          await emitAnalyticsEvent('shell.exec.failed', {
            caller: this.callerCtx.pluginId,
            command,
            args,
            reason: 'timeout',
            timingMs,
            traceId: this.callerCtx.traceId,
            spanId: this.callerCtx.spanId,
            requestId: this.callerCtx.requestId,
          });

          const errorEnv = toErrorEnvelope(
            SHELL_TIMEOUT,
            504,
            {
              command,
              args,
              timeoutMs,
              ...createErrorContext(SHELL_TIMEOUT, 'shell.exec', undefined, 'Command execution timeout'),
            },
            this.callerCtx,
            { timeMs: timingMs },
            this.callerManifest.permissions
          );

          return {
            ok: false,
            exitCode: 124, // Standard timeout exit code
            stdout: '',
            stderr: `Command timed out after ${timeoutMs}ms`,
            timingMs,
            error: errorEnv,
          };
        }

        // Other execution error
        const errorMessage = error instanceof Error ? error.message : String(error);
        const exitCode = error && typeof error === 'object' && 'exitCode' in error ? (error.exitCode as number) : 1;

        await emitAnalyticsEvent('shell.exec.failed', {
          caller: this.callerCtx.pluginId,
          command,
          args,
          reason: 'execution_failed',
          error: errorMessage,
          exitCode,
          timingMs,
          traceId: this.callerCtx.traceId,
          spanId: this.callerCtx.spanId,
          requestId: this.callerCtx.requestId,
        });

        const errorEnv = toErrorEnvelope(
          SHELL_EXECUTION_FAILED,
          500,
          {
            command,
            args,
            error: errorMessage,
            exitCode,
            ...createErrorContext(SHELL_EXECUTION_FAILED, 'shell.exec', undefined, errorMessage),
          },
          this.callerCtx,
          { timeMs: timingMs },
          this.callerManifest.permissions
        );

        return {
          ok: false,
          exitCode,
          stdout: error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : '',
          stderr: error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : errorMessage,
          timingMs,
          error: errorEnv,
        };
      }
    } catch (error: unknown) {
      const timingMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Shell execution error', {
        command,
        args,
        error: errorMessage,
      });

      const errorEnv = toErrorEnvelope(
        SHELL_EXECUTION_FAILED,
        500,
        {
          command,
          args,
          error: errorMessage,
          ...createErrorContext(SHELL_EXECUTION_FAILED, 'shell.exec', undefined, errorMessage),
        },
        this.callerCtx,
        { timeMs: timingMs },
        this.callerManifest.permissions
      );

      return {
        ok: false,
        exitCode: 1,
        stdout: '',
        stderr: errorMessage,
        timingMs,
        error: errorEnv,
      };
    }
  }

  /**
   * Spawn a shell command (for long-running processes)
   */
  async spawn(
    command: string,
    args: string[],
    options?: ShellSpawnOptions
  ): Promise<ShellSpawnResult> {
    const logger = this.createLogger({ command, args });

    // Check dry-run mode
    if (this.callerCtx.dryRun) {
      logger.info('DRY RUN: would spawn', { command, args });
      return {
        pid: 0,
        promise: Promise.resolve({
          ok: true,
          exitCode: 0,
          stdout: '',
          stderr: '',
          timingMs: 0,
        }),
        kill: () => {},
      };
    }

    // Build command spec
    const spec: ShellCommandSpec = {
      command,
      args: args || [],
    };

    // Check permissions (same as exec)
    const shellPerms = this.callerManifest.permissions?.shell;
    const permissionCheck = resolveShellDecision(shellPerms, spec);

    if (!permissionCheck.allow) {
      const error = toErrorEnvelope(
        SHELL_PERMISSION_DENIED,
        403,
        {
          command,
          args,
          reason: permissionCheck.reason,
        },
        this.callerCtx,
        { timeMs: 0 },
        this.callerManifest.permissions
      );

      return {
        pid: 0,
        promise: Promise.resolve({
          ok: false,
          exitCode: 1,
          stdout: '',
          stderr: permissionCheck.reason || 'Permission denied',
          timingMs: 0,
          error,
        }),
        kill: () => {},
      };
    }

    // Check dangerous commands
    const dangerousCheck = checkDangerousCommand(shellPerms, spec);
    if (dangerousCheck.requireConfirmation) {
      const confirmed = await this.requestConfirmation(spec, dangerousCheck.reason || 'dangerous command');
      if (!confirmed) {
        const error = toErrorEnvelope(
          SHELL_DANGEROUS_DENIED,
          403,
          {
            command,
            args,
            reason: 'Dangerous command denied by user',
          },
          this.callerCtx,
          { timeMs: 0 },
          this.callerManifest.permissions
        );

        return {
          pid: 0,
          promise: Promise.resolve({
            ok: false,
            exitCode: 1,
            stdout: '',
            stderr: 'Dangerous command denied by user',
            timingMs: 0,
            error,
          }),
          kill: () => {},
        };
      }
    }

    // Check concurrent process limit
    if (this.activeProcesses.size >= this.maxConcurrent) {
      const error = toErrorEnvelope(
        ErrorCode.PLUGIN_QUOTA_EXCEEDED,
        429,
        {
          message: `Maximum concurrent shell processes (${this.maxConcurrent}) exceeded`,
          current: this.activeProcesses.size,
          max: this.maxConcurrent,
        },
        this.callerCtx,
        { timeMs: 0 }
      );

      return {
        pid: 0,
        promise: Promise.resolve({
          ok: false,
          exitCode: 1,
          stdout: '',
          stderr: 'Too many concurrent processes',
          timingMs: 0,
          error,
        }),
        kill: () => {},
      };
    }

    // Prepare execution options
    const timeoutMs =
      options?.timeoutMs ??
      shellPerms?.timeoutMs ??
      this.callerManifest.permissions?.quotas?.timeoutMs ??
      30000;

    const cwd = options?.cwd || this.callerCtx.workdir;
    // Filter environment variables according to permissions (security: whitelist only)
    const baseEnv = pickEnv(process.env, this.callerManifest.permissions?.env?.allow);
    const env = {
      ...baseEnv,
      ...(options?.env || {}),
    };

    // Spawn process using native spawn (for long-running processes)
    const childProcess = nodeSpawn(command, args, {
      cwd,
      env,
      stdio: options?.stdio || 'pipe',
      signal: options?.signal,
    });

    if (!childProcess.pid) {
      // Process failed to start
      const errorEnv = toErrorEnvelope(
        SHELL_EXECUTION_FAILED,
        500,
        {
          command,
          args,
          error: 'Process failed to start',
        },
        this.callerCtx,
        { timeMs: 0 },
        this.callerManifest.permissions
      );

      return {
        pid: 0,
        promise: Promise.resolve({
          ok: false,
          exitCode: 1,
          stdout: '',
          stderr: 'Process failed to start',
          timingMs: 0,
          error: errorEnv,
        }),
        kill: () => {},
      };
    }

    const pid = childProcess.pid;
    this.activeProcesses.add(pid);

    const startTime = Date.now();
    let stdout = '';
    let stderr = '';

    // Collect stdout/stderr if pipe mode
    if (options?.stdio === 'pipe' || !options?.stdio) {
      if (childProcess.stdout) {
        childProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });
      }
      if (childProcess.stderr) {
        childProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }
    }

    // Set timeout if specified
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (timeoutMs > 0) {
      timeoutHandle = setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill('SIGTERM');
          // Force kill after grace period
          setTimeout(() => {
            if (!childProcess.killed) {
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }
      }, timeoutMs);
    }

    // Create promise that resolves when process completes
    const promise = new Promise<ShellResult>((resolve) => {
      childProcess.on('exit', async (exitCode: number | null, signal: string | null) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.activeProcesses.delete(pid);

        const timingMs = Date.now() - startTime;
        const finalExitCode = exitCode ?? (signal ? 128 : 1);

        if (exitCode === 0) {
          await emitAnalyticsEvent('shell.exec.finished', {
            caller: this.callerCtx.pluginId,
            command,
            args,
            exitCode: finalExitCode,
            timingMs,
          });

          resolve({
            ok: true,
            exitCode: finalExitCode,
            stdout,
            stderr,
            timingMs,
          });
        } else {
          await emitAnalyticsEvent('shell.exec.failed', {
            caller: this.callerCtx.pluginId,
            command,
            args,
            reason: signal ? 'killed' : 'execution_failed',
            exitCode: finalExitCode,
            timingMs,
          });

          const errorEnv = toErrorEnvelope(
            SHELL_EXECUTION_FAILED,
            500,
            {
              command,
              args,
              error: signal ? `Process killed by signal: ${signal}` : `Process exited with code ${finalExitCode}`,
              exitCode: finalExitCode,
            },
            this.callerCtx,
            { timeMs: timingMs },
            this.callerManifest.permissions
          );

          resolve({
            ok: false,
            exitCode: finalExitCode,
            stdout,
            stderr,
            timingMs,
            error: errorEnv,
          });
        }
      });

      childProcess.on('error', async (error: Error) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.activeProcesses.delete(pid);

        const timingMs = Date.now() - startTime;

        await emitAnalyticsEvent('shell.exec.failed', {
          caller: this.callerCtx.pluginId,
          command,
          args,
          reason: 'execution_failed',
          error: error.message,
          timingMs,
        });

        const errorEnv = toErrorEnvelope(
          SHELL_EXECUTION_FAILED,
          500,
          {
            command,
            args,
            error: error.message,
            exitCode: 1,
          },
          this.callerCtx,
          { timeMs: timingMs },
          this.callerManifest.permissions
        );

        resolve({
          ok: false,
          exitCode: 1,
          stdout,
          stderr,
          timingMs,
          error: errorEnv,
        });
      });
    });

    return {
      pid,
      promise,
      kill: (signal?: string) => {
        if (childProcess.killed) return;
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        childProcess.kill(signal as NodeJS.Signals | undefined);
        this.activeProcesses.delete(pid);
      },
    };
  }
}

