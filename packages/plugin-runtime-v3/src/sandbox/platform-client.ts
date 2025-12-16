/**
 * Platform RPC client for subprocess
 *
 * Connects to parent process's UnitSocketServer to access platform services.
 * This is a placeholder implementation - actual RPC will be implemented when needed.
 */

import type { PlatformServices, Logger } from '@kb-labs/plugin-contracts-v3';

/**
 * Create a mock logger for subprocess
 */
function createSubprocessLogger(): Logger {
  const log = (level: string, msg: string, meta?: Record<string, unknown>) => {
    const prefix = `[${level.toUpperCase()}]`;
    if (meta) {
      console.log(`${prefix} ${msg}`, meta);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  };

  return {
    debug: (msg, meta?) => log('debug', msg, meta),
    info: (msg, meta?) => log('info', msg, meta),
    warn: (msg, meta?) => log('warn', msg, meta),
    error: (msg, meta?) => log('error', msg, meta),
    child: (meta) => createSubprocessLogger(),
  };
}

/**
 * Connect to parent process platform services
 *
 * TODO: Implement actual RPC via UnitSocketServer when Phase 6 integration happens.
 * For now, returns mock implementations since subprocess can work without platform services
 * for basic file/network operations.
 *
 * @param socketPath Path to UnitSocketServer socket (future use)
 */
export async function connectToPlatform(socketPath?: string): Promise<PlatformServices> {
  const asyncNoop = async () => {};

  // Mock platform services for now
  // In Phase 6, this will connect to parent's UnitSocketServer via socketPath
  const platform: PlatformServices = {
    logger: createSubprocessLogger(),

    llm: {
      chat: async () => {
        throw new Error('LLM not available in subprocess (requires RPC connection)');
      },
    },

    embeddings: {
      embed: async () => {
        throw new Error('Embeddings not available in subprocess (requires RPC connection)');
      },
    },

    vectorStore: {
      search: async () => {
        throw new Error('VectorStore not available in subprocess (requires RPC connection)');
      },
    },

    cache: {
      get: async () => undefined,
      set: asyncNoop,
      delete: asyncNoop,
    },

    storage: {
      read: async () => new Uint8Array(),
      write: asyncNoop,
      delete: asyncNoop,
      exists: async () => false,
    },

    analytics: {
      track: asyncNoop,
    },
  };

  return platform;
}

/**
 * Disconnect from platform services
 *
 * Placeholder for cleanup when RPC is implemented.
 */
export async function disconnectFromPlatform(): Promise<void> {
  // No-op for now
}
