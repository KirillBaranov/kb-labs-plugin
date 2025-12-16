/**
 * Platform RPC client for subprocess
 *
 * Connects to parent process's UnixSocketServer to access platform services via RPC.
 */

import type { PlatformServices, Logger } from '@kb-labs/plugin-contracts-v3';
import { UnixSocketClient } from './unix-socket-client.js';

/**
 * Create a subprocess logger that writes to console
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

let rpcClient: UnixSocketClient | null = null;

/**
 * Connect to parent process platform services via Unix socket RPC
 *
 * @param socketPath Path to UnixSocketServer socket
 */
export async function connectToPlatform(socketPath?: string): Promise<PlatformServices> {
  if (!socketPath) {
    throw new Error('Socket path is required for platform RPC connection');
  }

  // Create and connect RPC client
  rpcClient = new UnixSocketClient({ socketPath });
  await rpcClient.connect();

  // Create platform services using RPC client
  const platform: PlatformServices = {
    // Logger runs in subprocess - doesn't need RPC
    logger: createSubprocessLogger(),

    // LLM service via RPC
    llm: {
      chat: async (request) => {
        return rpcClient!.call('llm', 'chat', [request]);
      },
    },

    // Embeddings service via RPC
    embeddings: {
      embed: async (request) => {
        return rpcClient!.call('embeddings', 'embed', [request]);
      },
    },

    // VectorStore service via RPC
    vectorStore: {
      search: async (request) => {
        return rpcClient!.call('vectorStore', 'search', [request]);
      },
    },

    // Cache service via RPC
    cache: {
      get: async (key) => {
        return rpcClient!.call('cache', 'get', [key]);
      },
      set: async (key, value, ttl) => {
        return rpcClient!.call('cache', 'set', [key, value, ttl]);
      },
      delete: async (key) => {
        return rpcClient!.call('cache', 'delete', [key]);
      },
    },

    // Storage service via RPC
    storage: {
      read: async (path) => {
        return rpcClient!.call('storage', 'read', [path]);
      },
      write: async (path, data) => {
        return rpcClient!.call('storage', 'write', [path, data]);
      },
      delete: async (path) => {
        return rpcClient!.call('storage', 'delete', [path]);
      },
      exists: async (path) => {
        return rpcClient!.call('storage', 'exists', [path]);
      },
    },

    // Analytics service via RPC
    analytics: {
      track: async (event) => {
        return rpcClient!.call('analytics', 'track', [event]);
      },
    },
  };

  return platform;
}

/**
 * Disconnect from platform services
 */
export async function disconnectFromPlatform(): Promise<void> {
  if (rpcClient) {
    await rpcClient.close();
    rpcClient = null;
  }
}
