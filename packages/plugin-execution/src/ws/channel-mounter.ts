/**
 * @module @kb-labs/plugin-execution/ws/channel-mounter
 *
 * Mount plugin WebSocket channels to Fastify server.
 * Follows the same pattern as route-mounter but for WebSocket channels.
 */

import type { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type {
  ManifestV3,
  PluginContextDescriptor,
  WebSocketHostContext,
  WSInput,
} from '@kb-labs/plugin-contracts';
import { DEFAULT_PERMISSIONS } from '@kb-labs/plugin-contracts';
import type { ExecutionBackend } from '../types.js';
import { connectionRegistry } from './connection-registry.js';
import { createWSSender } from './sender.js';

// Import utility functions (assuming they exist in utils.ts)
// If these don't exist, we'll need to create them or use alternatives
let createExecutionId: () => string;
let normalizeHeaders: (headers: Record<string, any>) => Record<string, string>;

try {
  const utils = await import('../utils.js');
  createExecutionId = utils.createExecutionId;
  normalizeHeaders = utils.normalizeHeaders;
} catch {
  // Fallback implementations if utils don't exist
  createExecutionId = () => `exec_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  normalizeHeaders = (headers) => {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalized[key.toLowerCase()] = String(value);
    }
    return normalized;
  };
}

export interface MountWebSocketChannelsOptions {
  /** Execution backend */
  backend: ExecutionBackend;

  /** Plugin root directory */
  pluginRoot: string;

  /** Workspace root directory */
  workspaceRoot: string;

  /** Base path prefix (optional, defaults to /v1/ws/plugins/{manifest.id}) */
  basePath?: string;

  /** Default timeout in ms (optional, default: 300000 = 5 minutes) */
  defaultTimeoutMs?: number;

  /** Default max message size in bytes (optional, default: 1MB) */
  defaultMaxMessageSize?: number;
}

/**
 * Mount plugin WebSocket channels to Fastify server.
 *
 * @param server - Fastify server instance
 * @param manifest - Plugin manifest
 * @param options - Mounting options
 * @returns Result with mounted count and errors
 */
export async function mountWebSocketChannels(
  server: FastifyInstance,
  manifest: ManifestV3,
  options: MountWebSocketChannelsOptions
): Promise<{ mounted: number; errors: string[] }> {
  const errors: string[] = [];
  let mounted = 0;

  const channels = manifest.ws?.channels ?? [];

  if (channels.length === 0) {
    return { mounted, errors };
  }

  // Register WebSocket plugin if not already registered
  if (!server.hasPlugin('@fastify/websocket')) {
    try {
      await server.register(fastifyWebsocket, {
        options: {
          maxPayload: options.defaultMaxMessageSize || 1024 * 1024, // 1MB
        },
      });
    } catch (error) {
      errors.push(`Failed to register WebSocket plugin: ${error instanceof Error ? error.message : String(error)}`);
      return { mounted, errors };
    }
  }

  const basePath = options.basePath || `/v1/ws/plugins/${manifest.id}`;

  for (const channel of channels) {
    try {
      const fullPath = `${basePath}${channel.path}`;

      // Register WebSocket route
      server.get(fullPath, { websocket: true }, async (connection, request) => {
        const ws = connection.socket as WebSocket;
        const connectionId = createExecutionId();

        // Extract IDs for tracing
        const requestId = (request.headers['x-request-id'] as string) || createExecutionId();
        const traceId = (request.headers['x-trace-id'] as string) || createExecutionId();
        const tenantId = request.headers['x-tenant-id'] as string | undefined;

        // Register connection
        connectionRegistry.register({
          connectionId,
          channelPath: channel.path,
          socket: ws,
          tenantId,
          metadata: {},
        });

        // Create sender interface
        const sender = createWSSender(ws, connectionId, channel.path);

        // Build WebSocketHostContext
        const hostContext: WebSocketHostContext = {
          host: 'ws',
          channelPath: channel.path,
          connectionId,
          clientIp: request.ip,
          headers: normalizeHeaders(request.headers),
          query: request.query as Record<string, string> | undefined,
          requestId,
          traceId,
          tenantId,
          // TODO: Extract user from auth token if auth is enabled
        };

        const descriptor: PluginContextDescriptor = {
          hostType: 'ws',
          pluginId: manifest.id,
          pluginVersion: manifest.version,
          requestId,
          permissions: channel.permissions || manifest.permissions || DEFAULT_PERMISSIONS,
          hostContext,
        };

        // Call onConnect lifecycle
        try {
          const connectInput: WSInput = { event: 'connect' };

          await options.backend.execute({
            executionId: createExecutionId(),
            descriptor,
            pluginRoot: options.pluginRoot,
            handlerRef: channel.handler,
            input: connectInput,
            workspace: {
              rootDir: options.workspaceRoot,
              packageManager: 'pnpm', // TODO: detect from lock file
            },
            sender, // Pass sender to execution context
          });
        } catch (error) {
          console.error('WebSocket onConnect failed:', error);
          ws.close(1011, 'Handler error');
          connectionRegistry.unregister(connectionId);
          return;
        }

        // Handle incoming messages
        ws.on('message', async (data) => {
          try {
            const rawMessage = JSON.parse(data.toString());
            const messageInput: WSInput = {
              event: 'message',
              message: {
                type: rawMessage.type,
                payload: rawMessage.payload,
                messageId: rawMessage.messageId,
                timestamp: rawMessage.timestamp || Date.now(),
              },
            };

            await options.backend.execute({
              executionId: createExecutionId(),
              descriptor,
              pluginRoot: options.pluginRoot,
              handlerRef: channel.handler,
              input: messageInput,
              workspace: {
                rootDir: options.workspaceRoot,
                packageManager: 'pnpm',
              },
              sender,
            });
          } catch (error) {
            console.error('WebSocket onMessage failed:', error);

            // Call onError handler
            const errorInput: WSInput = {
              event: 'error',
              error: error as Error,
            };

            try {
              await options.backend.execute({
                executionId: createExecutionId(),
                descriptor,
                pluginRoot: options.pluginRoot,
                handlerRef: channel.handler,
                input: errorInput,
                workspace: {
                  rootDir: options.workspaceRoot,
                  packageManager: 'pnpm',
                },
                sender,
              });
            } catch (err) {
              console.error('WebSocket onError failed:', err);
            }
          }
        });

        // Handle disconnect
        ws.on('close', async (code, reason) => {
          connectionRegistry.unregister(connectionId);

          try {
            const disconnectInput: WSInput = {
              event: 'disconnect',
              disconnectCode: code,
              disconnectReason: reason.toString(),
            };

            await options.backend.execute({
              executionId: createExecutionId(),
              descriptor,
              pluginRoot: options.pluginRoot,
              handlerRef: channel.handler,
              input: disconnectInput,
              workspace: {
                rootDir: options.workspaceRoot,
                packageManager: 'pnpm',
              },
            });
          } catch (error) {
            console.error('WebSocket onDisconnect failed:', error);
          }
        });

        // Handle errors
        ws.on('error', async (error) => {
          try {
            const errorInput: WSInput = {
              event: 'error',
              error,
            };

            await options.backend.execute({
              executionId: createExecutionId(),
              descriptor,
              pluginRoot: options.pluginRoot,
              handlerRef: channel.handler,
              input: errorInput,
              workspace: {
                rootDir: options.workspaceRoot,
                packageManager: 'pnpm',
              },
              sender,
            });
          } catch (err) {
            console.error('WebSocket onError handler failed:', err);
          }
        });
      });

      mounted++;
      console.log(`Mounted WebSocket channel: ${fullPath}`);
    } catch (error) {
      const errorMsg = `Failed to mount channel ${channel.path}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error(errorMsg, error);
    }
  }

  return { mounted, errors };
}
