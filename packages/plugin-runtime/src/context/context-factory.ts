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
} from '@kb-labs/plugin-contracts';
import { getLoggerMetadataFromHost } from '@kb-labs/plugin-contracts';
import { createPrefixedLogger } from '@kb-labs/core-platform';

import { createId, extractTraceId } from '../utils/index.js';
import { createTraceContext } from './trace.js';
import { createRuntimeAPI } from '../runtime/index.js';
import { createPluginAPI, type EventEmitterFn, type PluginInvokerFn } from '../api/index.js';
import { createGovernedPlatformServices } from '../platform/governed.js';

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

  /**
   * Current working directory (from WorkspaceLease)
   */
  cwd: string;

  /**
   * Output directory for artifacts (optional)
   */
  outdir?: string;
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
  const { descriptor, platform, ui, signal, eventEmitter, pluginInvoker, cwd, outdir } = options;

  // 1. Generate IDs (no parent tracking in V3)
  const spanId = createId();
  const traceId = createId();
  const requestId = `${traceId}:${spanId}`;

  // 2. Create cleanup stack
  const cleanupStack: Array<CleanupFn> = [];

  // 3. Create trace context (no parent tracking in V3)
  const trace = createTraceContext({
    traceId,
    spanId,
    parentSpanId: undefined,
    logger: platform.logger,
  });

  // 4. Create runtime API (sandboxed fs, fetch, env)
  const runtime = createRuntimeAPI({
    permissions: descriptor.permissions,
    cwd,
    outdir,
  });

  // 5. Apply permission governance to platform services
  // IMPORTANT: This must be done BEFORE passing platform to handlers
  // to ensure permission checks are enforced
  const governedPlatform = createGovernedPlatformServices(
    platform,
    descriptor.permissions,
    descriptor.pluginId
  );

  // 5.1. Enrich logger with host context (observability fields)
  const loggerMeta = getLoggerMetadataFromHost(descriptor.hostContext);
  const enrichedLogger = governedPlatform.logger.child(loggerMeta);

  // 5.2. Wrap logger with prefix protection to prevent plugins from overriding system fields
  const protectedLogger = createPrefixedLogger(enrichedLogger);

  const enrichedPlatform: PlatformServices = {
    ...governedPlatform,
    logger: protectedLogger,
  };

  // 6. Create plugin API
  // Use governed cache so permissions are enforced for api.state
  const finalOutdir = outdir ?? `${cwd}/.kb/output`;
  const api = createPluginAPI({
    pluginId: descriptor.pluginId,
    tenantId: descriptor.tenantId,
    cwd,
    outdir: finalOutdir,
    permissions: descriptor.permissions,
    cache: enrichedPlatform.cache, // Use governed cache, not raw
    eventEmitter,
    pluginInvoker,
    cleanupStack,
  });

  // 7. Assemble full context
  // Platform services passed through with enriched logger
  const context: PluginContextV3<TConfig> = {
    // Metadata
    host: descriptor.hostType,
    requestId,
    pluginId: descriptor.pluginId,
    pluginVersion: descriptor.pluginVersion,
    tenantId: descriptor.tenantId,
    cwd,
    outdir: finalOutdir,
    config: undefined, // Config comes from platform.config, not descriptor

    // Cancellation
    signal,

    // Tracing
    trace,

    // Host-specific
    hostContext: descriptor.hostContext,

    // Services
    ui,
    platform: enrichedPlatform, // ← Platform with enriched logger
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
