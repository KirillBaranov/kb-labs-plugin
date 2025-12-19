/**
 * @module @kb-labs/plugin-runtime/__tests__/sandbox-runner
 *
 * Tests for sandbox runner (runInProcess and runInSubprocess).
 *
 * Critical component: Entry points for all plugin execution.
 * Failure here breaks ALL V3 plugins.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInProcess } from '../sandbox/runner.js';
import { PluginError } from '@kb-labs/plugin-contracts';
import type { PluginContextDescriptor, UIFacade, PlatformServices } from '@kb-labs/plugin-contracts';
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
    it('should execute handler and return result with auto-injected metadata', async () => {
      const handlerPath = join(testDir, 'success-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return {
              exitCode: 0,
              result: { message: 'success', input },
              meta: { custom: 'value' }
            };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-123',
        commandId: 'test:command',
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
      expect(result.result).toEqual({
        message: 'success',
        input: { test: 'data' },
      });

      // Verify auto-injected metadata
      expect(result.meta).toBeDefined();
      expect(result.meta?.executedAt).toBeDefined();
      expect(typeof result.meta?.duration).toBe('number');
      expect(result.meta?.pluginId).toBe('@kb-labs/test');
      expect(result.meta?.pluginVersion).toBe('1.0.0');
      expect(result.meta?.commandId).toBe('test:command');
      expect(result.meta?.host).toBe('cli');
      expect(result.meta?.requestId).toBe('req-123');

      // Verify custom metadata is preserved
      expect(result.meta?.custom).toBe('value');
    });

    it('should handle handler returning void with metadata injection', async () => {
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
        requestId: 'req-456',
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
      expect(result.result).toBeUndefined();

      // Even for void handlers, metadata should be injected
      expect(result.meta).toBeDefined();
      expect(result.meta?.executedAt).toBeDefined();
      expect(typeof result.meta?.duration).toBe('number');
      expect(result.meta?.pluginId).toBe('@kb-labs/test');
      expect(result.meta?.requestId).toBe('req-456');
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
            return { exitCode: 0, result: { registered: true } };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-cleanup',
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
      expect(result.result).toEqual({ registered: true });
      expect(result.meta).toBeDefined();

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
            return { exitCode: 0, result: { hasSignal: ctx.signal !== undefined } };
          }
        };
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-signal',
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

      expect(result.result).toEqual({ hasSignal: true });
      expect(result.meta).toBeDefined();
    });

    it('should handle default export vs named exports', async () => {
      const handlerPath = join(testDir, 'named-export-handler.js');
      const handlerCode = `
        // No default export, handler is the module itself
        export async function execute(ctx, input) {
          return { exitCode: 0, result: { type: 'named' } };
        }
      `;
      writeFileSync(handlerPath, handlerCode);

      const descriptor: PluginContextDescriptor = {
        host: 'cli',
        pluginId: '@kb-labs/test',
        pluginVersion: '1.0.0',
        requestId: 'req-named',
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
      expect(result.result).toEqual({ type: 'named' });
      expect(result.meta).toBeDefined();
    });

    it('should provide complete context to handler', async () => {
      const handlerPath = join(testDir, 'context-handler.js');
      const handlerCode = `
        export default {
          async execute(ctx, input) {
            return {
              exitCode: 0,
              result: {
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
        requestId: 'req-context',
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

      expect(result.result).toEqual({
        hasHost: true,
        hasRequestId: true,
        hasUI: true,
        hasPlatform: true,
        hasRuntime: true,
        hasAPI: true,
        hasTrace: true,
      });
      expect(result.meta).toBeDefined();
    });
  });

  describe('runInSubprocess', () => {
    it('should find bootstrap.js in dist directory', async () => {
      const { accessSync, constants } = await import('node:fs');
      const { resolve, dirname } = await import('node:path');
      const { fileURLToPath } = await import('node:url');

      // Get the dist directory
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const distDir = resolve(__dirname, '../../dist/sandbox');
      const bootstrapPath = resolve(distDir, 'bootstrap.js');

      // Verify bootstrap.js exists and is readable
      expect(() => {
        accessSync(bootstrapPath, constants.R_OK);
      }).not.toThrow();
    });

    it('should execute handler in subprocess with IPC and metadata injection', async () => {
      // This test requires a UnixSocket server to be running
      // For now, we skip it in unit tests and cover in integration tests
      // where the full CLI environment is available

      // TODO: Create a mock UnixSocket server for unit testing subprocess execution
      expect(true).toBe(true);
    }, { skip: true });

    it('should handle subprocess timeout', async () => {
      // TODO: Create timeout test with mock UnixSocket server
      expect(true).toBe(true);
    }, { skip: true });

    it('should handle abort signal in subprocess', async () => {
      // TODO: Create abort signal test with mock UnixSocket server
      expect(true).toBe(true);
    }, { skip: true });
  });
});
