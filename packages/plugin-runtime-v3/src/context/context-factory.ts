/**
 * Plugin Context Factory
 *
 * Creates the full PluginContextV3 from a descriptor and platform services.
 */

import type {
  PluginContextV3,
  PluginContextDescriptor,
  PlatformServices,
  UIFacade,
  CleanupFn,
} from '@kb-labs/plugin-contracts-v3';

import { createId, extractTraceId } from '../utils/index.js';
import { createTraceContext } from './trace.js';
import { createRuntimeAPI } from '../runtime/index.js';
import { createPluginAPI, type EventEmitterFn, type PluginInvokerFn } from '../api/index.js';

export interface CreateContextOptions {
  /**
   * Plugin context descriptor (from IPC)
   */
  descriptor: PluginContextDescriptor;

  /**
   * Platform services
   */
  platform: PlatformServices;

  /**
   * UI facade for output
   */
  ui: UIFacade;

  /**
   * Abort signal for cancellation
   */
  signal?: AbortSignal;

  /**
   * Event emitter function (optional)
   */
  eventEmitter?: EventEmitterFn;

  /**
   * Plugin invoker function (optional)
   */
  pluginInvoker?: PluginInvokerFn;
}

export interface CreateContextResult<TConfig = unknown> {
  /**
   * The created context
   */
  context: PluginContextV3<TConfig>;

  /**
   * Cleanup stack (for executing cleanups after handler completes)
   */
  cleanupStack: Array<CleanupFn>;

  /**
   * Request ID for this execution
   */
  requestId: string;

  /**
   * Trace ID (propagated or new)
   */
  traceId: string;

  /**
   * Span ID (unique to this execution)
   */
  spanId: string;
}

/**
 * Create a full PluginContextV3
 */
export function createPluginContextV3<TConfig = unknown>(
  options: CreateContextOptions
): CreateContextResult<TConfig> {
  const { descriptor, platform, ui, signal, eventEmitter, pluginInvoker } = options;

  // 1. Generate IDs
  const spanId = createId();
  const traceId = descriptor.parentRequestId
    ? extractTraceId(descriptor.parentRequestId)
    : createId();
  const requestId = `${traceId}:${spanId}`;

  // 2. Create cleanup stack
  const cleanupStack: Array<CleanupFn> = [];

  // 3. Create trace context
  const trace = createTraceContext({
    traceId,
    spanId,
    parentSpanId: descriptor.parentRequestId
      ? descriptor.parentRequestId.split(':')[1]
      : undefined,
    logger: platform.logger,
  });

  // 4. Create runtime API (sandboxed fs, fetch, env)
  const runtime = createRuntimeAPI({
    permissions: descriptor.permissions,
    cwd: descriptor.cwd,
    outdir: descriptor.outdir,
  });

  // 5. Create plugin API
  const outdir = descriptor.outdir ?? `${descriptor.cwd}/.kb/output`;
  const api = createPluginAPI({
    pluginId: descriptor.pluginId,
    tenantId: descriptor.tenantId,
    cwd: descriptor.cwd,
    outdir,
    permissions: descriptor.permissions,
    cache: platform.cache,
    eventEmitter,
    pluginInvoker,
    cleanupStack,
  });

  // 6. Create child logger with plugin context
  const logger = platform.logger.child({
    plugin: descriptor.pluginId,
    requestId,
    traceId,
  });

  // 7. Assemble full context
  const context: PluginContextV3<TConfig> = {
    // Metadata
    host: descriptor.host,
    requestId,
    pluginId: descriptor.pluginId,
    pluginVersion: descriptor.pluginVersion,
    tenantId: descriptor.tenantId,
    cwd: descriptor.cwd,
    outdir,
    config: descriptor.config as TConfig,

    // Cancellation
    signal,

    // Tracing
    trace,

    // Host-specific
    hostContext: descriptor.hostContext,

    // Services
    ui,
    platform: {
      logger,
      llm: platform.llm,
      embeddings: platform.embeddings,
      vectorStore: platform.vectorStore,
      cache: platform.cache,
      storage: platform.storage,
      analytics: platform.analytics,
    },
    runtime,
    api,
  };

  return {
    context,
    cleanupStack,
    requestId,
    traceId,
    spanId,
  };
}
