/**
 * @module @kb-labs/plugin-runtime/context/plugin-context-factory
 * Unified factory for creating PluginContext with platform integration
 */

import { platform } from '@kb-labs/core-runtime';
import { createPluginContext, type PluginContext, type PluginContextOptions } from './plugin-context';
import type { PluginHostType } from './host';
import type { UIFacade } from './plugin-context';

/**
 * Options for creating PluginContext with platform integration
 */
export interface CreatePluginContextWithPlatformOptions<TConfig = any> {
  /** Execution host type */
  host: PluginHostType;
  /** Unique request identifier */
  requestId: string;
  /** Plugin identifier */
  pluginId: string;
  /** Plugin version */
  pluginVersion: string;
  /** Tenant identifier (for multi-tenancy) */
  tenantId?: string;
  /** UI facade (if not provided, creates appropriate one for host) */
  ui?: UIFacade;
  /** Resolved product configuration */
  config?: TConfig;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Create PluginContext with automatic platform integration.
 *
 * This is the SINGLE source of truth for creating PluginContext across all hosts.
 * It automatically injects platform services from the global platform singleton.
 *
 * @param options - Context creation options
 * @returns Fully configured PluginContext with platform services
 *
 * @example
 * ```typescript
 * // CLI host
 * const ctx = createPluginContextWithPlatform({
 *   host: 'cli',
 *   requestId: 'req-123',
 *   pluginId: 'my-plugin',
 *   pluginVersion: '1.0.0',
 *   ui: cliPresenter,
 * });
 *
 * // REST host
 * const ctx = createPluginContextWithPlatform({
 *   host: 'rest',
 *   requestId: request.id,
 *   pluginId: manifest.id,
 *   pluginVersion: manifest.version,
 *   metadata: { method: 'POST', path: '/api/test' },
 * });
 *
 * // Access platform services
 * await ctx.platform.analytics?.track('event', { foo: 'bar' });
 * const embedding = await ctx.platform.embeddings?.embed('text');
 * ```
 */
export function createPluginContextWithPlatform<TConfig = any>(
  options: CreatePluginContextWithPlatformOptions<TConfig>
): PluginContext<TConfig> {
  const {
    host,
    requestId,
    pluginId,
    pluginVersion,
    tenantId,
    ui,
    config,
    metadata,
  } = options;

  // Build platform services from global platform singleton
  const platformServices = {
    // Adapters (replaceable via kb.config.json)
    analytics: platform.analytics,
    vectorStore: platform.vectorStore,
    llm: platform.llm,
    embeddings: platform.embeddings,
    cache: platform.cache,
    storage: platform.storage,
    logger: platform.logger.child({ plugin: pluginId, tenant: tenantId }),
    events: platform.eventBus,
    invoke: platform.invoke,
    artifacts: platform.artifacts,

    // Core features (built-in, not replaceable)
    workflows: platform.workflows,
    jobs: platform.jobs,
    cron: platform.cron,
    resources: platform.resources,

    // Configuration check method
    isConfigured: (service: string): boolean => {
      // Check if adapter is explicitly configured (not using fallback)
      return platform.hasAdapter(service as any);
    },
  };

  // Create base options
  const contextOptions: PluginContextOptions<TConfig> = {
    requestId,
    pluginId,
    pluginVersion,
    tenantId,
    ui,
    config,
    platform: platformServices,
    metadata,
  };

  // Create and return PluginContext
  return createPluginContext(host, contextOptions);
}
