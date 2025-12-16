/**
 * @module @kb-labs/plugin-runtime-v3/__tests__/context-structure
 *
 * Integration tests for V3 plugin context structure.
 *
 * These tests verify that the actual context passed to plugin handlers
 * matches the expected PluginContextV3 interface. This prevents API drift
 * and ensures backward compatibility.
 */

import { describe, it, expect, vi } from 'vitest';
import { runInProcess } from '../sandbox/runner.js';
import type { PluginContextDescriptor, UIFacade, PlatformServices } from '@kb-labs/plugin-contracts-v3';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';

describe('V3 Context Structure', () => {
  /**
   * Mock UI facade for testing
   */
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

  /**
   * Mock platform services for testing
   */
  const mockLogger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(function(this: any) {
      return this; // Return self for child logger
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

  it('should provide complete PluginContextV3 structure', async () => {
    // Create temporary test handler
    const testDir = join(tmpdir(), `v3-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    const handlerPath = join(testDir, 'test-handler.js');
    const handlerCode = `
      export default {
        async execute(ctx, input) {
          // Capture context structure
          const structure = {
            // Top-level keys
            keys: Object.keys(ctx),

            // Metadata fields
            metadata: {
              host: ctx.host,
              hasRequestId: typeof ctx.requestId === 'string',
              hasPluginId: typeof ctx.pluginId === 'string',
              hasPluginVersion: typeof ctx.pluginVersion === 'string',
              hasCwd: typeof ctx.cwd === 'string',
              hasOutdir: ctx.outdir === undefined || typeof ctx.outdir === 'string',
              hasTenantId: ctx.tenantId === undefined || typeof ctx.tenantId === 'string',
              hasConfig: true, // Always present
            },

            // Signal
            signal: {
              present: ctx.signal !== undefined,
              isAbortSignal: ctx.signal instanceof AbortSignal,
            },

            // Host context
            hostContext: {
              present: ctx.hostContext !== undefined,
              hasHost: typeof ctx.hostContext?.host === 'string',
            },

            // Trace context
            trace: {
              keys: Object.keys(ctx.trace),
              hasTraceId: typeof ctx.trace.traceId === 'string',
              hasSpanId: typeof ctx.trace.spanId === 'string',
              hasAddEvent: typeof ctx.trace.addEvent === 'function',
            },

            // UI facade
            ui: {
              keys: Object.keys(ctx.ui).sort(),
              hasInfo: typeof ctx.ui.info === 'function',
              hasSuccess: typeof ctx.ui.success === 'function',
              hasWarn: typeof ctx.ui.warn === 'function',
              hasError: typeof ctx.ui.error === 'function',
            },

            // Platform services
            platform: {
              keys: Object.keys(ctx.platform).sort(),
              hasLogger: ctx.platform.logger !== undefined,
              hasLlm: ctx.platform.llm !== undefined,
              hasEmbeddings: ctx.platform.embeddings !== undefined,
              hasVectorStore: ctx.platform.vectorStore !== undefined,
              hasCache: ctx.platform.cache !== undefined,
              hasStorage: ctx.platform.storage !== undefined,
              hasAnalytics: ctx.platform.analytics !== undefined,
            },

            // Runtime API
            runtime: {
              keys: Object.keys(ctx.runtime).sort(),
              hasFs: ctx.runtime.fs !== undefined,
              hasFetch: typeof ctx.runtime.fetch === 'function',
              hasEnv: typeof ctx.runtime.env === 'function',

              // FS methods
              fsMethods: ctx.runtime.fs ? Object.keys(ctx.runtime.fs).sort() : [],
            },

            // Plugin API
            api: {
              keys: Object.keys(ctx.api).sort(),
              hasLifecycle: ctx.api.lifecycle !== undefined,
              hasOutput: ctx.api.output !== undefined,
              hasState: ctx.api.state !== undefined,
              hasArtifacts: ctx.api.artifacts !== undefined,
              hasShell: ctx.api.shell !== undefined,
              hasEvents: ctx.api.events !== undefined,
              hasInvoke: ctx.api.invoke !== undefined,

              // Lifecycle methods
              lifecycleMethods: Object.keys(ctx.api.lifecycle).sort(),

              // Output methods
              outputMethods: Object.keys(ctx.api.output).sort(),
            },
          };

          return { exitCode: 0, data: structure };
        }
      };
    `;

    writeFileSync(handlerPath, handlerCode);

    // Create descriptor
    const descriptor: PluginContextDescriptor = {
      host: 'cli',
      pluginId: '@kb-labs/test-plugin',
      pluginVersion: '1.0.0',
      tenantId: 'test-tenant',
      cwd: testDir,
      outdir: join(testDir, 'output'),
      config: { test: true },
      permissions: {
        fs: { read: [testDir], write: [testDir] },
      },
      hostContext: {
        host: 'cli',
        argv: ['test'],
        flags: { debug: true },
      },
      parentRequestId: undefined,
    };

    // Run in-process
    const abortController = new AbortController();
    const result = await runInProcess({
      descriptor,
      platform: mockPlatform,
      ui: mockUI,
      handlerPath,
      input: { test: 'data' },
      signal: abortController.signal,
    });

    expect(result.exitCode).toBe(0);
    expect(result.data).toBeDefined();

    const structure = result.data as any;

    // Assert top-level keys
    expect(structure.keys).toContain('host');
    expect(structure.keys).toContain('requestId');
    expect(structure.keys).toContain('pluginId');
    expect(structure.keys).toContain('pluginVersion');
    expect(structure.keys).toContain('cwd');
    expect(structure.keys).toContain('signal');
    expect(structure.keys).toContain('trace');
    expect(structure.keys).toContain('hostContext');
    expect(structure.keys).toContain('ui');
    expect(structure.keys).toContain('platform');
    expect(structure.keys).toContain('runtime');
    expect(structure.keys).toContain('api');

    // Assert metadata
    expect(structure.metadata.host).toBe('cli');
    expect(structure.metadata.hasRequestId).toBe(true);
    expect(structure.metadata.hasPluginId).toBe(true);
    expect(structure.metadata.hasPluginVersion).toBe(true);
    expect(structure.metadata.hasCwd).toBe(true);

    // Assert signal
    expect(structure.signal.present).toBe(true);
    expect(structure.signal.isAbortSignal).toBe(true);

    // Assert trace
    expect(structure.trace.hasTraceId).toBe(true);
    expect(structure.trace.hasSpanId).toBe(true);
    expect(structure.trace.hasAddEvent).toBe(true);

    // Assert UI facade methods
    expect(structure.ui.keys).toEqual([
      'box',
      'confirm',
      'debug',
      'divider',
      'error',
      'info',
      'json',
      'newline',
      'prompt',
      'spinner',
      'success',
      'table',
      'warn',
    ]);

    // Assert platform services
    expect(structure.platform.keys).toEqual([
      'analytics',
      'cache',
      'embeddings',
      'llm',
      'logger',
      'storage',
      'vectorStore',
    ]);

    // Assert runtime API
    expect(structure.runtime.keys).toEqual(['env', 'fetch', 'fs']);
    expect(structure.runtime.hasFs).toBe(true);
    expect(structure.runtime.hasFetch).toBe(true);
    expect(structure.runtime.hasEnv).toBe(true);

    // Assert FS methods (17 methods as per spec)
    expect(structure.runtime.fsMethods).toEqual([
      'basename',
      'copy',
      'dirname',
      'exists',
      'extname',
      'join',
      'mkdir',
      'move',
      'readFile',
      'readFileBuffer',
      'readdir',
      'readdirWithStats',
      'relative',
      'resolve',
      'rm',
      'stat',
      'writeFile',
    ]);

    // Assert plugin API
    expect(structure.api.keys).toEqual([
      'artifacts',
      'events',
      'invoke',
      'lifecycle',
      'output',
      'shell',
      'state',
    ]);

    // Assert lifecycle methods
    expect(structure.api.lifecycleMethods).toContain('onCleanup');

    // Assert output methods
    expect(structure.api.outputMethods).toEqual([
      '_getState',
      'getMeta',
      'getResult',
      'meta',
      'result',
    ]);
  });

  it('should maintain API stability (snapshot test)', async () => {
    // This test will fail if the context structure changes
    // Update snapshot only when intentional API changes are made

    const testDir = join(tmpdir(), `v3-snapshot-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    const handlerPath = join(testDir, 'snapshot-handler.js');
    const handlerCode = `
      export default {
        async execute(ctx) {
          return {
            exitCode: 0,
            data: {
              topLevelKeys: Object.keys(ctx).sort(),
              uiMethods: Object.keys(ctx.ui).sort(),
              traceMethods: Object.keys(ctx.trace).sort(),
              platformServices: Object.keys(ctx.platform).sort(),
              runtimeAPIs: Object.keys(ctx.runtime).sort(),
              fsMethods: Object.keys(ctx.runtime.fs).sort(),
              apiModules: Object.keys(ctx.api).sort(),
              lifecycleMethods: Object.keys(ctx.api.lifecycle).sort(),
              outputMethods: Object.keys(ctx.api.output).sort(),
            }
          };
        }
      };
    `;

    writeFileSync(handlerPath, handlerCode);

    const descriptor: PluginContextDescriptor = {
      host: 'cli',
      pluginId: '@kb-labs/snapshot-test',
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

    const snapshot = result.data as any;

    // Snapshot: Top-level context keys
    expect(snapshot.topLevelKeys).toMatchInlineSnapshot(`
      [
        "api",
        "config",
        "cwd",
        "host",
        "hostContext",
        "outdir",
        "platform",
        "pluginId",
        "pluginVersion",
        "requestId",
        "runtime",
        "signal",
        "tenantId",
        "trace",
        "ui",
      ]
    `);

    // Snapshot: UI methods
    expect(snapshot.uiMethods).toMatchInlineSnapshot(`
      [
        "box",
        "confirm",
        "debug",
        "divider",
        "error",
        "info",
        "json",
        "newline",
        "prompt",
        "spinner",
        "success",
        "table",
        "warn",
      ]
    `);

    // Snapshot: Platform services
    expect(snapshot.platformServices).toMatchInlineSnapshot(`
      [
        "analytics",
        "cache",
        "embeddings",
        "llm",
        "logger",
        "storage",
        "vectorStore",
      ]
    `);

    // Snapshot: Runtime APIs
    expect(snapshot.runtimeAPIs).toMatchInlineSnapshot(`
      [
        "env",
        "fetch",
        "fs",
      ]
    `);

    // Snapshot: FS methods
    expect(snapshot.fsMethods).toMatchInlineSnapshot(`
      [
        "basename",
        "copy",
        "dirname",
        "exists",
        "extname",
        "join",
        "mkdir",
        "move",
        "readFile",
        "readFileBuffer",
        "readdir",
        "readdirWithStats",
        "relative",
        "resolve",
        "rm",
        "stat",
        "writeFile",
      ]
    `);

    // Snapshot: Plugin API modules
    expect(snapshot.apiModules).toMatchInlineSnapshot(`
      [
        "artifacts",
        "events",
        "invoke",
        "lifecycle",
        "output",
        "shell",
        "state",
      ]
    `);
  });

  it.todo('should provide same structure in subprocess mode (Phase 6)', async () => {
    // TODO: Implement when IPC is ready (Phase 6)
    // This test should verify that subprocess execution provides
    // the same context structure as in-process execution
    //
    // Requirements:
    // 1. Bootstrap.js must be built and accessible
    // 2. UnixSocket/HTTP IPC server must be running
    // 3. Subprocess cleanup must be handled properly
    //
    // Expected test:
    // const result = await runInSubprocess({
    //   descriptor: { ... },
    //   socketPath: '/tmp/test-ipc.sock',
    //   handlerPath: '/tmp/test-handler.js',
    //   input: {},
    // });
    //
    // expect(result.data).toMatchObject({
    //   topLevelKeys: ['api', 'config', 'cwd', ...],
    //   uiMethodsCount: 13,
    //   platformServicesCount: 7,
    //   runtimeAPIsCount: 3,
    //   fsMethodsCount: 17,
    // });
  });
});
