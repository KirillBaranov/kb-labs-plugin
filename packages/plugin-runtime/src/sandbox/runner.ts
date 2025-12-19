/**
 * Sandbox runner for executing plugins
 *
 * Supports two modes:
 * - In-process: For trusted plugins or development
 * - Subprocess: For sandboxed execution
 */

import { fork, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  PluginContextDescriptor,
  PlatformServices,
  UIFacade,
  CommandResult,
  CommandResultWithMeta,
  StandardMeta,
} from '@kb-labs/plugin-contracts';
import { PluginError, TimeoutError, AbortError } from '@kb-labs/plugin-contracts';
import type { ParentMessage, ChildMessage, ResultMessage, ErrorMessage } from './ipc-protocol.js';
import { createPluginContextV3 } from '../context/index.js';
import { executeCleanup } from '../api/index.js';

/**
 * Inject standard metadata into command result
 */
function injectStandardMeta<T>(
  result: CommandResult<T> | void,
  context: {
    pluginId: string;
    pluginVersion: string;
    commandId?: string;
    host: 'cli' | 'rest' | 'workflow' | 'webhook';
    tenantId?: string;
    requestId: string;
    startTime: number;
  }
): CommandResultWithMeta<T> {
  const endTime = Date.now();
  const duration = endTime - context.startTime;

  const standardMeta: StandardMeta = {
    executedAt: new Date(context.startTime).toISOString(),
    duration,
    pluginId: context.pluginId,
    pluginVersion: context.pluginVersion,
    commandId: context.commandId,
    host: context.host,
    tenantId: context.tenantId,
    requestId: context.requestId,
  };

  // If handler returned nothing, create default result
  if (!result) {
    return {
      exitCode: 0,
      meta: standardMeta as StandardMeta & Record<string, unknown>,
    };
  }

  // Merge user meta with standard meta
  // User meta can override standard meta if needed (no protection yet)
  const mergedMeta: StandardMeta & Record<string, unknown> = {
    ...result.meta,
    ...standardMeta,
  } as StandardMeta & Record<string, unknown>;

  return {
    exitCode: result.exitCode ?? 0,
    result: result.result,
    meta: mergedMeta,
  };
}

export interface RunInProcessOptions {
  descriptor: PluginContextDescriptor;
  platform: PlatformServices;
  ui: UIFacade;
  handlerPath: string;
  input: unknown;
  signal?: AbortSignal;
}

export interface RunInSubprocessOptions {
  descriptor: PluginContextDescriptor;
  socketPath: string;
  handlerPath: string;
  input: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Run plugin handler in the current process (no sandbox)
 *
 * Use for trusted plugins or development.
 */
export async function runInProcess<T = unknown>(
  options: RunInProcessOptions
): Promise<CommandResultWithMeta<T>> {
  const { descriptor, platform, ui, handlerPath, input, signal } = options;
  const startTime = Date.now();

  // Create context
  const { context, cleanupStack } = createPluginContextV3({
    descriptor,
    platform,
    ui,
    signal,
  });

  try {
    // Import and execute handler
    const handlerModule = await import(handlerPath);
    const handler = handlerModule.default ?? handlerModule;

    if (typeof handler.execute !== 'function') {
      throw new PluginError(
        `Handler at ${handlerPath} does not export an execute function`,
        'INVALID_HANDLER'
      );
    }

    const result: CommandResult<T> | void = await handler.execute(context, input);

    // Inject standard metadata
    return injectStandardMeta(result, {
      pluginId: descriptor.pluginId,
      pluginVersion: descriptor.pluginVersion,
      commandId: descriptor.commandId,
      host: descriptor.host,
      tenantId: descriptor.tenantId,
      requestId: descriptor.requestId,
      startTime,
    });
  } finally {
    // Execute cleanups
    await executeCleanup(cleanupStack, platform.logger);
  }
}

/**
 * Run plugin handler in a subprocess (sandboxed)
 */
export async function runInSubprocess<T = unknown>(
  options: RunInSubprocessOptions
): Promise<CommandResultWithMeta<T>> {
  const {
    descriptor,
    socketPath,
    handlerPath,
    input,
    timeoutMs = 30000,
    signal,
  } = options;

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    // Path to bootstrap script
    // Strategy: try multiple locations to find bootstrap.js
    // 1. Same dir as current module (production: cli-bin/dist/bootstrap.js)
    // 2. Sandbox subdir (development: runtime-v3/dist/sandbox/bootstrap.js)
    // 3. Relative to cwd (fallback)

    const currentDir = path.dirname(new URL(import.meta.url).pathname);
    const possiblePaths = [
      path.join(currentDir, 'bootstrap.js'),           // Production (same dir)
      path.join(currentDir, 'sandbox', 'bootstrap.js'), // Nested sandbox dir
      path.join(process.cwd(), 'dist', 'sandbox', 'bootstrap.js'), // Test/dev mode
      path.join(process.cwd(), 'dist', 'bootstrap.js'), // Fallback
      path.join(process.cwd(), 'packages', 'plugin-runtime', 'dist', 'sandbox', 'bootstrap.js'), // Monorepo test mode
    ];

    let bootstrapPath: string | undefined;
    for (const p of possiblePaths) {
      try {
        fs.accessSync(p, fs.constants.R_OK);
        bootstrapPath = p;
        break;
      } catch {
        continue;
      }
    }

    if (!bootstrapPath) {
      throw new Error(
        `[V3] Could not find bootstrap.js. Tried:\n${possiblePaths.join('\n')}`
      );
    }

    // Fork child process
    const child: ChildProcess = fork(bootstrapPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV,
        KB_SOCKET_PATH: socketPath,
      },
    });

    let completed = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    // Handle abort signal
    const abortHandler = () => {
      if (!completed) {
        child.send({ type: 'abort' } satisfies ParentMessage);
        // Give it a moment to clean up, then kill
        setTimeout(() => {
          if (!completed) {
            child.kill('SIGKILL');
          }
        }, 1000);
      }
    };

    if (signal) {
      signal.addEventListener('abort', abortHandler);
    }

    // Pipe stdout/stderr to parent
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);

    // Set timeout
    timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        child.kill('SIGKILL');
        reject(new TimeoutError(`Plugin execution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    // Handle messages from child
    child.on('message', (msg: ChildMessage) => {
      if (msg.type === 'ready') {
        // Child is ready, send execute message
        const executeMsg: ParentMessage = {
          type: 'execute',
          descriptor,
          socketPath,
          handlerPath,
          input,
        };
        child.send(executeMsg);
      } else if (msg.type === 'result') {
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);

        const resultMsg = msg as ResultMessage;

        // Inject standard metadata
        const resultWithMeta = injectStandardMeta<T>(
          {
            exitCode: resultMsg.exitCode,
            result: resultMsg.result as T,
            meta: resultMsg.meta,
          },
          {
            pluginId: descriptor.pluginId,
            pluginVersion: descriptor.pluginVersion,
            commandId: descriptor.commandId,
            host: descriptor.host,
            tenantId: descriptor.tenantId,
            requestId: descriptor.requestId,
            startTime,
          }
        );

        resolve(resultWithMeta);
      } else if (msg.type === 'error') {
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);

        const errorMsg = msg as ErrorMessage;
        reject(PluginError.fromJSON(errorMsg.error));
      }
    });

    // Handle child exit
    child.on('exit', (code) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);

        if (signal?.aborted) {
          reject(new AbortError());
        } else {
          reject(new PluginError(
            `Plugin process exited with code ${code}`,
            'PROCESS_EXIT',
            { code }
          ));
        }
      }
    });

    // Handle child error
    child.on('error', (error) => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortHandler);
        reject(error);
      }
    });
  });
}
