/**
 * @module @kb-labs/plugin-runtime-v3/__tests__/sandbox-runner
 *
 * Tests for sandbox runner (runInProcess and runInSubprocess).
 *
 * Critical component: Entry points for all plugin execution.
 * Failure here breaks ALL V3 plugins.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInProcess } from '../sandbox/runner.js';
import { PluginError } from '@kb-labs/plugin-contracts-v3';
import type { PluginContextDescriptor, UIFacade, PlatformServices } from '@kb-labs/plugin-contracts-v3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

describe('Sandbox Runner', () => {
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
    child: vi.fn(function(this: any) {
      return this;
    }),
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

  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `v3-runner-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  describe('runInProcess', () => {
    it('should execute handler and return result', async () => {
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

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: { test: 'data' },
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

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.data).toBeUndefined();
    });

    it('should throw PluginError if handler missing execute function', async () => {
      const handlerPath = join(testDir, 'invalid-handler.js');
      const handlerCode = `
        export default {
          // No execute function
          someOtherMethod() {}
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
        runInProcess({
          descriptor,
          platform: mockPlatform,
          ui: mockUI,
          handlerPath,
          input: {},
        })
      ).rejects.toThrow(PluginError);

      await expect(
        runInProcess({
          descriptor,
          platform: mockPlatform,
          ui: mockUI,
          handlerPath,
          input: {},
        })
      ).rejects.toThrow(/does not export an execute function/);
    });

    it('should execute cleanup handlers after success', async () => {
      // Use a file to track cleanup execution
      const cleanupFlag = join(testDir, 'cleanup-flag.txt');

      const handlerPath = join(testDir, 'cleanup-handler.js');
      const handlerCode = `
        import { writeFileSync } from 'node:fs';

        export default {
          async execute(ctx, input) {
            ctx.api.lifecycle.onCleanup(async () => {
              writeFileSync('${cleanupFlag}', 'cleaned');
            });
            return { exitCode: 0, data: { registered: true } };
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

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.data).toEqual({ registered: true });

      // Cleanup should have run and written file
      const { readFileSync, existsSync } = await import('node:fs');
      expect(existsSync(cleanupFlag)).toBe(true);
      expect(readFileSync(cleanupFlag, 'utf-8')).toBe('cleaned');
    });

    it('should execute cleanup handlers even after error', async () => {
      const cleanupFlag = join(testDir, 'cleanup-error-flag.txt');

      const handlerPath = join(testDir, 'cleanup-error-handler.js');
      const handlerCode = `
        import { writeFileSync } from 'node:fs';

        export default {
          async execute(ctx, input) {
            ctx.api.lifecycle.onCleanup(async () => {
              writeFileSync('${cleanupFlag}', 'cleaned-after-error');
            });
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
        runInProcess({
          descriptor,
          platform: mockPlatform,
          ui: mockUI,
          handlerPath,
          input: {},
        })
      ).rejects.toThrow('Handler failed');

      // Cleanup should have run even after error
      const { readFileSync, existsSync } = await import('node:fs');
      expect(existsSync(cleanupFlag)).toBe(true);
      expect(readFileSync(cleanupFlag, 'utf-8')).toBe('cleaned-after-error');
    });

    it('should pass signal to context', async () => {
      const handlerPath = join(testDir, 'signal-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return { exitCode: 0, data: { hasSignal: ctx.signal !== undefined } };
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
      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
        signal: abortController.signal,
      });

      expect(result.data).toEqual({ hasSignal: true });
    });

    it('should handle default export vs named exports', async () => {
      const handlerPath = join(testDir, 'named-export-handler.js');
      const handlerCode = `
        // No default export, handler is the module itself
        export async function execute(ctx, input) {
          return { exitCode: 0, data: { type: 'named' } };
        }
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

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
      });

      expect(result.exitCode).toBe(0);
      expect(result.data).toEqual({ type: 'named' });
    });

    it('should provide complete context to handler', async () => {
      const handlerPath = join(testDir, 'context-handler.js');
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

      const result = await runInProcess({
        descriptor,
        platform: mockPlatform,
        ui: mockUI,
        handlerPath,
        input: {},
      });

      expect(result.data).toEqual({
        hasHost: true,
        hasRequestId: true,
        hasUI: true,
        hasPlatform: true,
        hasRuntime: true,
        hasAPI: true,
        hasTrace: true,
      });
    });
  });

  describe('runInSubprocess', () => {
    it('should execute handler in subprocess via IPC', async () => {
      // This test verifies the complete subprocess execution flow:
      // 1. Bootstrap.js resolution works
      // 2. Child process spawns successfully
      // 3. UnixSocket IPC communication works
      // 4. Platform services accessible via RPC
      // 5. Result is returned correctly

      // NOTE: Skipping this test in unit tests because it requires:
      // - Building bootstrap.js first
      // - Starting real UnixSocketServer
      // - Forking real child process
      // This is covered by integration tests instead.

      expect(true).toBe(true);
    }, { skip: true });

    it('should handle subprocess timeout', async () => {
      // NOTE: Skipping - requires real subprocess fork
      // Covered by integration tests
      expect(true).toBe(true);
    }, { skip: true });

    it('should handle abort signal in subprocess', async () => {
      // NOTE: Skipping - requires real subprocess fork
      // Covered by integration tests
      expect(true).toBe(true);
    }, { skip: true });

    it('should find bootstrap.js using multi-location fallback', async () => {
      // NOTE: Skipping - requires real subprocess fork
      // Covered by integration tests
      expect(true).toBe(true);
    }, { skip: true });
  });
});
