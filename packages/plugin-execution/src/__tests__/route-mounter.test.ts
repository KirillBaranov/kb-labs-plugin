/**
 * @module @kb-labs/plugin-execution/__tests__/route-mounter
 *
 * Tests for HTTP route mounter (mountRoutes function).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mountRoutes } from '../http/route-mounter.js';
import type { ExecutionBackend, ExecutionRequest, ExecutionResult } from '../types.js';
import type { ManifestV3 } from '@kb-labs/plugin-contracts';
import { DEFAULT_PERMISSIONS } from '@kb-labs/plugin-contracts';

// Mock Fastify types
interface MockFastifyRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  raw: {
    on: (event: string, handler: () => void) => void;
  };
}

interface MockFastifyReply {
  header: (name: string, value: string) => MockFastifyReply;
  code: (statusCode: number) => MockFastifyReply;
  send: (data: unknown) => unknown;
}

interface MockFastifyInstance {
  get: (path: string, handler: (req: MockFastifyRequest, reply: MockFastifyReply) => Promise<unknown>) => void;
  post: (path: string, handler: (req: MockFastifyRequest, reply: MockFastifyReply) => Promise<unknown>) => void;
  put: (path: string, handler: (req: MockFastifyRequest, reply: MockFastifyReply) => Promise<unknown>) => void;
  delete: (path: string, handler: (req: MockFastifyRequest, reply: MockFastifyReply) => Promise<unknown>) => void;
  patch: (path: string, handler: (req: MockFastifyRequest, reply: MockFastifyReply) => Promise<unknown>) => void;
  log: {
    info: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

describe('mountRoutes', () => {
  // Create mock backend
  const createMockBackend = (result: Partial<ExecutionResult> = {}): ExecutionBackend => ({
    execute: vi.fn().mockResolvedValue({
      ok: true,
      data: { result: 'success' },
      executionTimeMs: 100,
      metadata: { backend: 'in-process', workspaceId: 'ws-123' },
      ...result,
    }),
    health: vi.fn().mockResolvedValue({ healthy: true, backend: 'in-process' }),
    stats: vi.fn().mockResolvedValue({ totalExecutions: 0, successCount: 0, errorCount: 0, avgExecutionTimeMs: 0 }),
    shutdown: vi.fn().mockResolvedValue(undefined),
  });

  // Create mock Fastify server
  const createMockServer = (): MockFastifyInstance & { handlers: Map<string, (req: MockFastifyRequest, reply: MockFastifyReply) => Promise<unknown>> } => {
    const handlers = new Map<string, (req: MockFastifyRequest, reply: MockFastifyReply) => Promise<unknown>>();

    return {
      handlers,
      get: vi.fn((path, handler) => handlers.set(`GET ${path}`, handler)),
      post: vi.fn((path, handler) => handlers.set(`POST ${path}`, handler)),
      put: vi.fn((path, handler) => handlers.set(`PUT ${path}`, handler)),
      delete: vi.fn((path, handler) => handlers.set(`DELETE ${path}`, handler)),
      patch: vi.fn((path, handler) => handlers.set(`PATCH ${path}`, handler)),
      log: {
        info: vi.fn(),
        error: vi.fn(),
      },
    };
  };

  // Create mock request
  const createMockRequest = (overrides?: Partial<MockFastifyRequest>): MockFastifyRequest => ({
    method: 'POST',
    url: '/test',
    headers: { 'content-type': 'application/json' },
    query: {},
    body: { input: 'data' },
    raw: {
      on: vi.fn(),
    },
    ...overrides,
  });

  // Create mock reply
  const createMockReply = (): MockFastifyReply => {
    const reply: MockFastifyReply = {
      header: vi.fn().mockReturnThis(),
      code: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnValue(undefined),
    };
    return reply;
  };

  // Create test manifest
  const createManifest = (routes: ManifestV3['rest']): ManifestV3 => ({
    schema: 'kb.plugin/3',
    id: '@test/plugin',
    version: '1.0.0',
    rest: routes,
    permissions: DEFAULT_PERMISSIONS,
  });

  describe('route registration', () => {
    it('should register routes for each method type', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest({
        routes: [
          { method: 'GET', path: '/get', handler: './dist/get.js' },
          { method: 'POST', path: '/post', handler: './dist/post.js' },
          { method: 'PUT', path: '/put', handler: './dist/put.js' },
          { method: 'DELETE', path: '/delete', handler: './dist/delete.js' },
          { method: 'PATCH', path: '/patch', handler: './dist/patch.js' },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      expect(server.get).toHaveBeenCalledWith('/get', expect.any(Function));
      expect(server.post).toHaveBeenCalledWith('/post', expect.any(Function));
      expect(server.put).toHaveBeenCalledWith('/put', expect.any(Function));
      expect(server.delete).toHaveBeenCalledWith('/delete', expect.any(Function));
      expect(server.patch).toHaveBeenCalledWith('/patch', expect.any(Function));
    });

    it('should apply basePath prefix', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest({
        routes: [
          { method: 'GET', path: '/search', handler: './dist/search.js' },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
        basePath: '/v1/plugins/mind',
      });

      expect(server.get).toHaveBeenCalledWith('/v1/plugins/mind/search', expect.any(Function));
    });

    it('should skip when no routes defined', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest(undefined);

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      expect(server.get).not.toHaveBeenCalled();
      expect(server.post).not.toHaveBeenCalled();
    });

    it('should skip when routes array is empty', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest({ routes: [] });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      expect(server.get).not.toHaveBeenCalled();
    });
  });

  describe('request handling', () => {
    it('should call backend.execute with correct request', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest({
        routes: [
          { method: 'POST', path: '/execute', handler: './dist/handler.js' },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      const handler = server.handlers.get('POST /execute')!;
      const request = createMockRequest({ body: { query: 'test' } });
      const reply = createMockReply();

      await handler(request, reply);

      expect(backend.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          executionId: expect.any(String),
          descriptor: expect.objectContaining({
            host: 'rest',
            pluginId: '@test/plugin',
            pluginVersion: '1.0.0',
          }),
          pluginRoot: '/plugins/test',
          handlerRef: './dist/handler.js',
          input: { query: 'test' },
        }),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('should return success response with correct headers', async () => {
      const server = createMockServer();
      const backend = createMockBackend({
        ok: true,
        data: { result: 'data' },
        executionTimeMs: 150,
      });

      const manifest = createManifest({
        routes: [
          { method: 'GET', path: '/data', handler: './dist/handler.js' },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      const handler = server.handlers.get('GET /data')!;
      const request = createMockRequest({ method: 'GET' });
      const reply = createMockReply();

      await handler(request, reply);

      expect(reply.header).toHaveBeenCalledWith('X-Request-Id', expect.any(String));
      expect(reply.header).toHaveBeenCalledWith('X-Execution-Id', expect.any(String));
      expect(reply.header).toHaveBeenCalledWith('X-Execution-Time-Ms', '150');
      expect(reply.send).toHaveBeenCalledWith({ result: 'data' });
    });

    it('should return error response with correct status code', async () => {
      const server = createMockServer();
      const backend = createMockBackend({
        ok: false,
        error: { code: 'TIMEOUT', message: 'Request timed out', name: 'TimeoutError' },
        executionTimeMs: 30000,
      });

      const manifest = createManifest({
        routes: [
          { method: 'POST', path: '/slow', handler: './dist/handler.js' },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      const handler = server.handlers.get('POST /slow')!;
      const request = createMockRequest();
      const reply = createMockReply();

      await handler(request, reply);

      expect(reply.code).toHaveBeenCalledWith(504); // Gateway Timeout
      expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Request timed out',
        code: 'TIMEOUT',
      }));
    });

    it('should use route-specific timeout', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest({
        routes: [
          { method: 'POST', path: '/custom', handler: './dist/handler.js', timeoutMs: 60000 },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
        defaultTimeoutMs: 30000,
      });

      const handler = server.handlers.get('POST /custom')!;
      const request = createMockRequest();
      const reply = createMockReply();

      await handler(request, reply);

      expect(backend.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: 60000,
        }),
        expect.anything()
      );
    });

    it('should use default timeout when route does not specify', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest({
        routes: [
          { method: 'POST', path: '/default', handler: './dist/handler.js' },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
        defaultTimeoutMs: 45000,
      });

      const handler = server.handlers.get('POST /default')!;
      const request = createMockRequest();
      const reply = createMockReply();

      await handler(request, reply);

      expect(backend.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMs: 45000,
        }),
        expect.anything()
      );
    });
  });

  describe('error status codes', () => {
    const testCases: Array<{ code: string; expectedStatus: number }> = [
      { code: 'TIMEOUT', expectedStatus: 504 },
      { code: 'ABORTED', expectedStatus: 499 },
      { code: 'PERMISSION_DENIED', expectedStatus: 403 },
      { code: 'HANDLER_NOT_FOUND', expectedStatus: 404 },
      { code: 'VALIDATION_ERROR', expectedStatus: 400 },
      { code: 'HANDLER_CONTRACT_ERROR', expectedStatus: 500 },
      { code: 'QUEUE_FULL', expectedStatus: 429 },
      { code: 'ACQUIRE_TIMEOUT', expectedStatus: 503 },
      { code: 'WORKER_UNHEALTHY', expectedStatus: 503 },
      { code: 'WORKER_CRASHED', expectedStatus: 500 },
      { code: 'UNKNOWN_CODE', expectedStatus: 500 },
    ];

    for (const { code, expectedStatus } of testCases) {
      it(`should return ${expectedStatus} for ${code}`, async () => {
        const server = createMockServer();
        const backend = createMockBackend({
          ok: false,
          error: { code, message: 'Error message', name: 'Error' },
        });

        const manifest = createManifest({
          routes: [
            { method: 'POST', path: '/test', handler: './dist/handler.js' },
          ],
        });

        await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
          backend,
          pluginRoot: '/plugins/test',
          workspaceRoot: '/workspace',
        });

        const handler = server.handlers.get('POST /test')!;
        const request = createMockRequest();
        const reply = createMockReply();

        await handler(request, reply);

        expect(reply.code).toHaveBeenCalledWith(expectedStatus);
      });
    }
  });

  describe('descriptor building', () => {
    it('should build correct RestHostContext', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest({
        routes: [
          { method: 'POST', path: '/search', handler: './dist/handler.js' },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      const handler = server.handlers.get('POST /search')!;
      const request = createMockRequest({
        method: 'POST',
        url: '/search?limit=10',
        headers: { 'content-type': 'application/json', 'x-custom': 'value' },
        query: { limit: '10' },
        body: { query: 'test' },
      });
      const reply = createMockReply();

      await handler(request, reply);

      expect(backend.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          descriptor: expect.objectContaining({
            hostContext: expect.objectContaining({
              host: 'rest',
              method: 'POST',
              path: '/search?limit=10',
              headers: expect.objectContaining({
                'content-type': 'application/json',
                'x-custom': 'value',
              }),
              query: { limit: '10' },
              body: { query: 'test' },
            }),
          }),
        }),
        expect.anything()
      );
    });

    it('should use manifest permissions', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const customPermissions = {
        ...DEFAULT_PERMISSIONS,
        fs: { read: ['/custom/**'] as string[], write: [] as string[] },
      };

      const manifest = createManifest({
        routes: [
          { method: 'GET', path: '/data', handler: './dist/handler.js' },
        ],
      });
      manifest.permissions = customPermissions;

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      const handler = server.handlers.get('GET /data')!;
      const request = createMockRequest({ method: 'GET' });
      const reply = createMockReply();

      await handler(request, reply);

      expect(backend.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          descriptor: expect.objectContaining({
            permissions: customPermissions,
          }),
        }),
        expect.anything()
      );
    });
  });

  describe('logging', () => {
    it('should log mounted routes', async () => {
      const server = createMockServer();
      const backend = createMockBackend();

      const manifest = createManifest({
        routes: [
          { method: 'GET', path: '/health', handler: './dist/health.js' },
          { method: 'POST', path: '/data', handler: './dist/data.js' },
        ],
      });

      await mountRoutes(server as unknown as Parameters<typeof mountRoutes>[0], manifest, {
        backend,
        pluginRoot: '/plugins/test',
        workspaceRoot: '/workspace',
      });

      expect(server.log.info).toHaveBeenCalledTimes(2);
      expect(server.log.info).toHaveBeenCalledWith(
        expect.objectContaining({
          plugin: '@test/plugin',
          method: 'GET',
          path: '/health',
        }),
        'Mounted route'
      );
    });
  });
});
