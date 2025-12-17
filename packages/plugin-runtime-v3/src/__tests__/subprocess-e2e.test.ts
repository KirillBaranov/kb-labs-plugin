/**
 * @module @kb-labs/plugin-runtime-v3/__tests__/subprocess-e2e
 *
 * E2E tests for subprocess execution with real IPC.
 *
 * These tests verify the complete subprocess flow:
 * - Fork child process with bootstrap.js
 * - UnixSocket IPC communication
 * - Platform services RPC
 * - Handler execution in isolation
 * - Cleanup and error handling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import * as net from 'net';
import * as fs from 'fs';
import { runInSubprocess } from '../sandbox/runner.js';
import type { PluginContextDescriptor } from '@kb-labs/plugin-contracts-v3';
import { TimeoutError, AbortError } from '@kb-labs/plugin-contracts-v3';

/**
 * Minimal UnixSocketServer for E2E tests
 * (copy from @kb-labs/adapters-transport to avoid cross-monorepo dependency)
 */
class UnixSocketServer {
  private server: net.Server | null = null;
  private clients = new Set<net.Socket>();
  private callHandler?: (call: any) => Promise<any>;
  private socketPath: string;

  constructor(config: { socketPath: string }) {
    this.socketPath = config.socketPath;
  }

  onCall(handler: (call: any) => Promise<any>): void {
    this.callHandler = handler;
  }

  async start(): Promise<void> {
    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }

    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => {
        this.clients.add(socket);
        let buffer = '';

        socket.on('data', (data) => {
          buffer += data.toString('utf8');

          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);

            if (line.trim().length === 0) continue;

            try {
              const call = JSON.parse(line);
              this.handleCall(socket, call);
            } catch (error) {
              console.error('[UnixSocketServer] Parse error:', error);
            }
          }
        });

        socket.on('close', () => {
          this.clients.delete(socket);
        });
      });

      this.server.listen(this.socketPath, () => {
        fs.chmodSync(this.socketPath, 0o666);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  private async handleCall(socket: net.Socket, call: any): Promise<void> {
    if (!this.callHandler) return;

    try {
      const response = await this.callHandler(call);
      socket.write(JSON.stringify(response) + '\n', 'utf8');
    } catch (error) {
      const errorResponse = {
        type: 'adapter:response',
        requestId: call.requestId,
        error: {
          __type: 'Error',
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      };
      socket.write(JSON.stringify(errorResponse) + '\n', 'utf8');
    }
  }

  async close(): Promise<void> {
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = null;
    }

    if (fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }
  }
}

describe('Subprocess E2E', () => {
  let testDir: string;
  let socketPath: string;
  let server: UnixSocketServer | null = null;

  beforeAll(async () => {
    // Create test directory
    testDir = join(tmpdir(), `v3-subprocess-e2e-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create socket path
    socketPath = join(tmpdir(), `kb-e2e-${Date.now()}.sock`);

    // Start UnixSocketServer for platform RPC
    server = new UnixSocketServer({ socketPath });

    server.onCall(async (call) => {
      // Mock platform service responses
      if (call.adapter === 'cache' && call.method === 'get') {
        const key = call.args[0] as string;
        return {
          type: 'adapter:response',
          requestId: call.requestId,
          result: { key, value: `cached-${key}` },
        };
      }

      if (call.adapter === 'llm' && call.method === 'chat') {
        return {
          type: 'adapter:response',
          requestId: call.requestId,
          result: {
            content: 'Hello from LLM',
            usage: { input: 10, output: 5 },
          },
        };
      }

      // Default response
      return {
        type: 'adapter:response',
        requestId: call.requestId,
        result: null,
      };
    });

    await server.start();
  });

  afterAll(async () => {
    // Cleanup server
    if (server) {
      await server.close();
    }

    // Cleanup test directory
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Basic Execution', () => {
    it('should execute handler in subprocess and return result', async () => {
      const handlerPath = join(testDir, 'success-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return { exitCode: 0, data: { message: 'success', input } };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        cwd: testDir,
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
        parentRequestId: undefined,
      };

      const result = await runInSubprocess({
        descriptor,
        socketPath,
        handlerPath,
        input: { test: 'data' },
        timeoutMs: 5000,
      });

      expect(result.exitCode).toBe(0);
      expect(result.data).toEqual({
        message: 'success',
        input: { test: 'data' },
      });
    });

    it('should handle handler returning void', async () => {
      const handlerPath = join(testDir, 'void-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            // No return (void)
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        cwd: testDir,
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
        parentRequestId: undefined,
      };

      const result = await runInSubprocess({
        descriptor,
        socketPath,
        handlerPath,
        input: {},
        timeoutMs: 5000,
      });

      expect(result.exitCode).toBe(0);
      expect(result.data).toBeUndefined();
    });
  });

  describe('Platform RPC', () => {
    it('should access platform services via RPC', async () => {
      const handlerPath = join(testDir, 'platform-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            // Call platform.cache via RPC
            const cached = await ctx.platform.cache.get('test-key');
            return { exitCode: 0, data: { cached } };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        cwd: testDir,
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
        parentRequestId: undefined,
      };

      const result = await runInSubprocess({
        descriptor,
        socketPath,
        handlerPath,
        input: {},
        timeoutMs: 5000,
      });

      expect(result.exitCode).toBe(0);
      expect(result.data?.cached).toEqual({
        key: 'test-key',
        value: 'cached-test-key',
      });
    });

    it('should make multiple concurrent RPC calls', async () => {
      const handlerPath = join(testDir, 'concurrent-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            // Multiple concurrent platform calls
            const [cached1, cached2, llmResult] = await Promise.all([
              ctx.platform.cache.get('key1'),
              ctx.platform.cache.get('key2'),
              ctx.platform.llm.chat({ messages: [{ role: 'user', content: 'hi' }] }),
            ]);

            return {
              exitCode: 0,
              data: { cached1, cached2, llm: llmResult.content }
            };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        cwd: testDir,
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
        parentRequestId: undefined,
      };

      const result = await runInSubprocess({
        descriptor,
        socketPath,
        handlerPath,
        input: {},
        timeoutMs: 5000,
      });

      expect(result.exitCode).toBe(0);
      expect(result.data?.cached1).toEqual({ key: 'key1', value: 'cached-key1' });
      expect(result.data?.cached2).toEqual({ key: 'key2', value: 'cached-key2' });
      expect(result.data?.llm).toBe('Hello from LLM');
    });
  });

  describe('Error Handling', () => {
    it('should propagate errors from subprocess', async () => {
      const handlerPath = join(testDir, 'error-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            throw new Error('Handler failed');
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        cwd: testDir,
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
        parentRequestId: undefined,
      };

      await expect(
        runInSubprocess({
          descriptor,
          socketPath,
          handlerPath,
          input: {},
          timeoutMs: 5000,
        })
      ).rejects.toThrow('Handler failed');
    });

    it('should handle timeout', async () => {
      const handlerPath = join(testDir, 'timeout-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            // Wait longer than timeout
            await new Promise(resolve => setTimeout(resolve, 10000));
            return { exitCode: 0, data: { never: 'reached' } };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        cwd: testDir,
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
        parentRequestId: undefined,
      };

      await expect(
        runInSubprocess({
          descriptor,
          socketPath,
          handlerPath,
          input: {},
          timeoutMs: 500, // Short timeout
        })
      ).rejects.toThrow(TimeoutError);
    }, 10000);

    it('should handle abort signal', async () => {
      const handlerPath = join(testDir, 'abort-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            // Wait for abort
            await new Promise(resolve => setTimeout(resolve, 10000));
            return { exitCode: 0, data: { never: 'reached' } };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        cwd: testDir,
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
        parentRequestId: undefined,
      };

      const abortController = new AbortController();

      // Abort after 200ms
      setTimeout(() => abortController.abort(), 200);

      await expect(
        runInSubprocess({
          descriptor,
          socketPath,
          handlerPath,
          input: {},
          timeoutMs: 5000,
          signal: abortController.signal,
        })
      ).rejects.toThrow(AbortError);
    }, 10000);
  });

  describe('Context Validation', () => {
    it('should provide complete context in subprocess', async () => {
      const handlerPath = join(testDir, 'context-check-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return {
              exitCode: 0,
              data: {
                hasHost: typeof ctx.host === 'string',
                hasRequestId: typeof ctx.requestId === 'string',
                hasUI: ctx.ui !== undefined,
                hasPlatform: ctx.platform !== undefined,
                hasRuntime: ctx.runtime !== undefined,
                hasAPI: ctx.api !== undefined,
                hasTrace: ctx.trace !== undefined,
                hasSignal: ctx.signal !== undefined,
              }
            };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        cwd: testDir,
        permissions: {},
        hostContext: { host: 'cli', argv: [], flags: {} },
        parentRequestId: undefined,
      };

      const result = await runInSubprocess({
        descriptor,
        socketPath,
        handlerPath,
        input: {},
        timeoutMs: 5000,
      });

      expect(result.data).toEqual({
        hasHost: true,
        hasRequestId: true,
        hasUI: true,
        hasPlatform: true,
        hasRuntime: true,
        hasAPI: true,
        hasTrace: true,
        hasSignal: true,
      });
    });
  });
});
