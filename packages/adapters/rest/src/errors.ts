/**
 * @module @kb-labs/plugin-adapter-rest/errors
 * Error mapping and handling
 */

import type { PluginErrorEnvelope } from '@kb-labs/api-contracts';
import type { FastifyReply } from 'fastify';

/**
 * Map error to ErrorEnvelope and send response
 */
export function handleError(
  error: unknown,
  reply: FastifyReply
): void {
  // If already PluginErrorEnvelope, use it
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 'error'
  ) {
    const envelope = error as PluginErrorEnvelope;
    reply.status(envelope.http).send(envelope);
    return;
  }

  // Generic error - convert to ErrorEnvelope
  const envelope: PluginErrorEnvelope = {
    status: 'error',
    http: 500,
    code: 'E_INTERNAL',
    message: error instanceof Error ? error.message : String(error),
    details: {
      error: error instanceof Error ? error.message : String(error),
    },
    trace: error instanceof Error ? error.stack : undefined,
    meta: {
      requestId: reply.request.id as string || 'unknown',
      pluginId: 'unknown',
      pluginVersion: '0.0.0',
      routeOrCommand: reply.request.url || 'unknown',
      timeMs: 0,
    },
  };

  reply.status(500).send(envelope);
}

/**
 * Global error guard - never crashes the API
 */
export function createErrorGuard<T>(
  handler: (request: any, reply: FastifyReply) => Promise<T>
): (request: any, reply: FastifyReply) => Promise<void> {
  return async (request: any, reply: FastifyReply) => {
    try {
      await handler(request, reply);
    } catch (error) {
      handleError(error, reply);
    }
  };
}
