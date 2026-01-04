/**
 * @module @kb-labs/plugin-runtime/__tests__/subprocess-integration
 *
 * Integration tests for subprocess execution with real IPC.
 *
 * These tests verify:
 * 1. Real subprocess fork works
 * 2. IPC communication between parent/child
 * 3. Metadata injection through subprocess boundary
 * 4. Timeout and abort handling
 *
 * NOTE: These require built bootstrap.js and are slower than unit tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { runInSubprocess } from '../sandbox/runner.js';
import { wrapCliResult } from '../host/cli-wrapper.js';
import type { PluginContextDescriptor, UIFacade, PlatformServices, CommandResult } from '@kb-labs/plugin-contracts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { rmSync } from 'node:fs';

describe('Subprocess Integration Tests', () => {
  const mockUI: UIFacade = {
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    spinner: vi.fn(),
    table: vi.fn(),
    json: vi.fn(),
    newline: vi.fn(),
    divider: vi.fn(),
    box: vi.fn(),
    confirm: vi.fn(async () => true),
    prompt: vi.fn(async () => 'test'),
  };

  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(function(this: any) { return this; }),
  };

  const mockPlatform: PlatformServices = {
    logger: mockLogger as any,
    llm: {} as any,
    embeddings: {} as any,
    vectorStore: {} as any,
    cache: {} as any,
    storage: {} as any,
    analytics: {} as any,
  };

  it('should execute handler in real subprocess and inject metadata', async () => {
    // This test requires:
    // 1. Built bootstrap.js
    // 2. Mock UnixSocket server for platform RPC
    // 3. Test handler file

    const testDir = join(tmpdir(), `subprocess-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
      // Create test handler
      const handlerPath = join(testDir, 'subprocess-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return {
              exitCode: 0,
              result: {
                message: 'Hello from subprocess',
                pid: process.pid,
                hasContext: ctx !== undefined,
              },
              meta: {
                customField: 'subprocess-value',
              },
            };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      // Create mock UnixSocket server
      const socketPath = join(testDir, 'test.sock');
      const server = createServer((socket) => {
        socket.on('data', (data) => {
          try {
            const request = JSON.parse(data.toString());

            // Mock RPC responses
            const response = {
              id: request.id,
              result: null, // Most methods return void
            };

            socket.write(JSON.stringify(response) + '\n');
          } catch (err) {
            console.error('Mock server error:', err);
          }
        });
      });

      await new Promise<void>((resolve) => {
        server.listen(socketPath, () => resolve());
      });

      try {
        const descriptor: PluginContextDescriptor = {
          hostType: 'cli',
          pluginId: '@kb-labs/test-subprocess',
          pluginVersion: '1.0.0',
          requestId: 'subprocess-req-123',
          handlerId: 'test:subprocess',
          permissions: {},
          hostContext: { host: 'cli', argv: [], flags: {} },
        };

        const runResult = await runInSubprocess<CommandResult<unknown>>({
          descriptor,
          socketPath,
          handlerPath,
          input: {},
          timeoutMs: 5000,
          cwd: testDir,
        });

        // Wrap into CLI format for assertion
        const result = wrapCliResult(runResult, descriptor);

        // Verify result
        expect(result.exitCode).toBe(0);
        expect(result.result).toBeDefined();
        expect((result.result as any).message).toBe('Hello from subprocess');
        expect((result.result as any).hasContext).toBe(true);
        expect((result.result as any).pid).not.toBe(process.pid); // Different process!

        // Verify metadata auto-injection
        expect(result.meta).toBeDefined();
        expect(result.meta?.executedAt).toBeDefined();
        expect(typeof result.meta?.duration).toBe('number');
        expect(result.meta?.pluginId).toBe('@kb-labs/test-subprocess');
        expect(result.meta?.pluginVersion).toBe('1.0.0');
        expect(result.meta?.commandId).toBe('test:subprocess');
        expect(result.meta?.host).toBe('cli');
        expect(result.meta?.requestId).toBe('subprocess-req-123');

        // Verify custom metadata preserved
        expect(result.meta?.customField).toBe('subprocess-value');
      } finally {
        server.close();
      }
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, { timeout: 10000 });

  it('should handle subprocess timeout', async () => {
    const testDir = join(tmpdir(), `subprocess-timeout-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
      // Create handler that never completes
      const handlerPath = join(testDir, 'timeout-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            // Infinite loop - will timeout
            await new Promise(() => {});
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      // Create mock UnixSocket server
      const socketPath = join(testDir, 'timeout.sock');
      const server = createServer(() => {});
      await new Promise<void>((resolve) => {
        server.listen(socketPath, () => resolve());
      });

      try {
        const descriptor: PluginContextDescriptor = {
          hostType: 'cli',
          pluginId: '@kb-labs/test-timeout',
          pluginVersion: '1.0.0',
          requestId: 'timeout-req',
          permissions: {},
          hostContext: { host: 'cli', argv: [], flags: {} },
        };

        await expect(
          runInSubprocess({
            descriptor,
            socketPath,
            handlerPath,
            input: {},
            timeoutMs: 1000, // 1 second timeout
            cwd: testDir,
          })
        ).rejects.toThrow(/timed out/);
      } finally {
        server.close();
      }
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, { timeout: 5000 });

  it('should handle abort signal in subprocess', async () => {
    const testDir = join(tmpdir(), `subprocess-abort-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
      // Create handler that takes some time
      const handlerPath = join(testDir, 'abort-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            // Wait for 5 seconds (will be aborted)
            await new Promise(resolve => setTimeout(resolve, 5000));
            return { exitCode: 0, result: { completed: true } };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      // Create mock UnixSocket server
      const socketPath = join(testDir, 'abort.sock');
      const server = createServer(() => {});
      await new Promise<void>((resolve) => {
        server.listen(socketPath, () => resolve());
      });

      try {
        const descriptor: PluginContextDescriptor = {
          hostType: 'cli',
          pluginId: '@kb-labs/test-abort',
          pluginVersion: '1.0.0',
          requestId: 'abort-req',
          permissions: {},
          hostContext: { host: 'cli', argv: [], flags: {} },
        };

        const abortController = new AbortController();

        // Abort after 500ms
        setTimeout(() => abortController.abort(), 500);

        await expect(
          runInSubprocess({
            descriptor,
            socketPath,
            handlerPath,
            input: {},
            signal: abortController.signal,
            timeoutMs: 10000,
            cwd: testDir,
          })
        ).rejects.toThrow(/abort/);
      } finally {
        server.close();
      }
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  }, { timeout: 5000 });
});
