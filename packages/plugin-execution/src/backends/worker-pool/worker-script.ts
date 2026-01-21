/**
 * @module @kb-labs/plugin-execution/backends/worker-pool/worker-script
 *
 * Worker subprocess entry point.
 * This script runs in a forked process and handles IPC messages.
 */

import type {
  WorkerMessage,
  ExecuteMessage,
  ResultMessage,
  ErrorMessage,
  HealthOkMessage,
  ReadyMessage,
  ShutdownMessage,
} from './types.js';
import type { ExecutionRequest, ExecutionResult } from '../../types.js';

// Worker state
const workerId = process.env.KB_WORKER_ID ?? 'unknown';
let isShuttingDown = false;

/**
 * Handle execute message.
 */
async function handleExecute(message: ExecuteMessage): Promise<void> {
  const { requestId, request, timeoutMs } = message;

  try {
    // Dynamic import to avoid loading at startup
    const { runInProcess } = await import('@kb-labs/plugin-runtime');
    const { noopUI, DEFAULT_PERMISSIONS } = await import('@kb-labs/plugin-contracts');
    const path = await import('node:path');
    const fs = await import('node:fs');

    // Resolve handler path
    const handlerPath = path.resolve(request.pluginRoot, request.handlerRef);

    if (!fs.existsSync(handlerPath)) {
      sendError(requestId, {
        message: `Handler not found: ${handlerPath}`,
        code: 'HANDLER_NOT_FOUND',
      });
      return;
    }

    // Create platform with proxy adapters (IPC to parent process)
    // Socket path is passed via environment variable by parent
    const socketPath = process.env.KB_IPC_SOCKET_PATH;

    let platform;
    if (socketPath) {
      // Production: Use proxy platform (IPC to parent)
      const { createProxyPlatform } = await import('@kb-labs/core-runtime');
      platform = await createProxyPlatform({ socketPath });
    } else {
      // Fallback: Use noop platform (dev/testing without IPC)
      const noopLogger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        trace: () => {},
        child: () => noopLogger,
      };

      platform = {
        logger: noopLogger,
        llm: {
          complete: async () => ({
            content: '',
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: 'noop'
          }),
          stream: async function* () {},
        },
        cache: {
          get: async () => null,
          set: async () => {},
          delete: async () => {},
          clear: async () => {},
          zadd: async () => {},
          zrangebyscore: async () => [],
          zrem: async () => {},
          setIfNotExists: async () => false,
        },
        embeddings: {
          embed: async () => [],
          embedBatch: async () => [],
          dimensions: 1536,
          getDimensions: async () => 1536,
        },
        vectorStore: {
          upsert: async () => {},
          search: async () => [],
          delete: async () => {},
          get: async () => null,
        },
        storage: {
          get: async () => undefined,
          set: async () => {},
          delete: async () => {},
          list: async () => [],
          exists: async () => false,
        },
        sqlDatabase: {
          query: async () => ({ rows: [], rowCount: 0 }),
          execute: async () => ({ rowCount: 0 }),
        },
        documentDatabase: {
          findOne: async () => null,
          find: async () => [],
          insertOne: async () => ({ insertedId: '' }),
          updateOne: async () => ({ modifiedCount: 0 }),
          deleteOne: async () => ({ deletedCount: 0 }),
        },
        analytics: {
          track: () => {},
          identify: () => {},
          flush: async () => {},
        },
        eventBus: {
          on: () => () => {},
          once: () => () => {},
          off: () => {},
          emit: async () => {},
        },
      };
    }

    // Execute handler
    const result = await runInProcess({
      descriptor: request.descriptor,
      platform,
      ui: noopUI,
      handlerPath,
      input: request.input,
    });

    // Send result
    const resultMessage: ResultMessage = {
      type: 'result',
      requestId,
      result: {
        ok: true, // runInProcess doesn't throw, so if we get here it's success
        data: result.data,
        executionTimeMs: 0, // TODO: track execution time in worker
        metadata: {
          backend: 'worker-pool',
          workerId,
          executionMeta: result.meta,
        },
      },
    };

    process.send!(resultMessage);
  } catch (error) {
    sendError(requestId, {
      message: error instanceof Error ? error.message : String(error),
      code: 'HANDLER_ERROR',
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

/**
 * Send error message to parent.
 */
function sendError(
  requestId: string,
  error: { message: string; code?: string; stack?: string }
): void {
  const errorMessage: ErrorMessage = {
    type: 'error',
    requestId,
    error,
  };
  process.send!(errorMessage);
}

/**
 * Handle health check.
 */
function handleHealth(): void {
  const memory = process.memoryUsage();
  const message: HealthOkMessage = {
    type: 'healthOk',
    memoryUsage: {
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
      rss: memory.rss,
    },
    uptime: process.uptime(),
  };
  process.send!(message);
}

/**
 * Handle shutdown request.
 */
function handleShutdown(message: ShutdownMessage): void {
  isShuttingDown = true;

  if (message.graceful) {
    // Let current work finish, then exit
    setTimeout(() => {
      process.exit(0);
    }, 100);
  } else {
    process.exit(0);
  }
}

/**
 * Message handler.
 */
function onMessage(message: WorkerMessage): void {
  if (isShuttingDown && message.type !== 'shutdown') {
    return;
  }

  switch (message.type) {
    case 'execute':
      handleExecute(message as ExecuteMessage);
      break;

    case 'health':
      handleHealth();
      break;

    case 'shutdown':
      handleShutdown(message as ShutdownMessage);
      break;
  }
}

// Setup IPC
process.on('message', onMessage);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error(`[Worker ${workerId}] Uncaught exception:`, error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(`[Worker ${workerId}] Unhandled rejection:`, reason);
  process.exit(1);
});

// Send ready message
const readyMessage: ReadyMessage = {
  type: 'ready',
  pid: process.pid,
};
process.send!(readyMessage);
