/**
 * Platform RPC client for subprocess
 *
 * Connects to parent process's UnixSocketServer to access platform services via RPC.
 */

import type { PlatformServices, Logger, LLMResponse } from '@kb-labs/plugin-contracts';
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
    error: (msg, _error?, meta?) => log('error', msg, meta),
    trace: (msg, meta?) => log('trace', msg, meta),
    child: (_bindings) => createSubprocessLogger(),
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
      complete: async (prompt, options?) => {
        return rpcClient!.call('llm', 'complete', [prompt, options]);
      },
      stream: async function* (prompt, options?) {
        // For now, streaming falls back to complete() and yields once
        // TODO: Implement proper streaming via Unix socket
        const response = (await rpcClient!.call('llm', 'complete', [prompt, options])) as LLMResponse;
        yield response.content;
      },
    },

    // Embeddings service via RPC
    embeddings: {
      embed: async (text) => {
        return rpcClient!.call('embeddings', 'embed', [text]);
      },
      embedBatch: async (texts) => {
        return rpcClient!.call('embeddings', 'embedBatch', [texts]);
      },
      dimensions: 1536, // Default OpenAI dimensions
      getDimensions: async () => {
        return rpcClient!.call('embeddings', 'getDimensions', []);
      },
    },

    // VectorStore service via RPC
    vectorStore: {
      search: async (query, limit, filter?) => {
        return rpcClient!.call('vectorStore', 'search', [query, limit, filter]);
      },
      upsert: async (vectors) => {
        return rpcClient!.call('vectorStore', 'upsert', [vectors]);
      },
      delete: async (ids) => {
        return rpcClient!.call('vectorStore', 'delete', [ids]);
      },
      count: async () => {
        return rpcClient!.call('vectorStore', 'count', []);
      },
    },

    // Cache service via RPC
    cache: {
      get: async (key) => {
        return rpcClient!.call('cache', 'get', [key]);
      },
      set: async (key, value, ttl?) => {
        return rpcClient!.call('cache', 'set', [key, value, ttl]);
      },
      delete: async (key) => {
        return rpcClient!.call('cache', 'delete', [key]);
      },
      clear: async (pattern?) => {
        return rpcClient!.call('cache', 'clear', [pattern]);
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
      list: async (prefix) => {
        return rpcClient!.call('storage', 'list', [prefix]);
      },
      exists: async (path) => {
        return rpcClient!.call('storage', 'exists', [path]);
      },
    },

    // Analytics service via RPC
    analytics: {
      track: async (event, properties?) => {
        return rpcClient!.call('analytics', 'track', [event, properties]);
      },
      identify: async (userId, traits?) => {
        return rpcClient!.call('analytics', 'identify', [userId, traits]);
      },
      flush: async () => {
        return rpcClient!.call('analytics', 'flush', []);
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
