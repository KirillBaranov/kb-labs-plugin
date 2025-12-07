/**
 * @module @kb-labs/plugin-runtime/context/plugin-context
 * Unified PluginContext factory and supporting types.
 */

import {
  createNoopUI,
  type PresenterFacade,
  type PresenterProgressPayload,
  type UIFacade,
  type UIColors,
  type UISymbols,
  type ColorFn,
  type BoxOptions,
  type TableRow,
  type KeyValueOptions,
} from '../presenter/presenter-facade';
import type { PluginHostType } from './host';

// Platform abstractions
import type {
  IVectorStore,
  ILLM,
  IEmbeddings,
  ICache,
  IStorage,
  ILogger,
  IEventBus,
  IInvoke,
  IArtifacts,
  IWorkflowEngine,
  IJobScheduler,
  ICronManager,
  IResourceManager,
  IAnalytics,
} from '@kb-labs/core-platform';

// Re-export UI types for convenience
export type { UIFacade, UIColors, UISymbols, ColorFn, BoxOptions, TableRow, KeyValueOptions };

/**
 * Platform services available through PluginContext.
 *
 * All platform services are declared in manifest.platform.requires/optional.
 * If a service is in `requires`, it's guaranteed to be available (non-null).
 * If a service is in `optional`, it may be undefined.
 *
 * @example
 * ```json
 * {
 *   "platform": {
 *     "requires": ["embeddings", "vectorStore"],
 *     "optional": ["llm"]
 *   }
 * }
 * ```
 *
 * ```typescript
 * // Required services - guaranteed available
 * const embedding = await ctx.platform.embeddings.embed(text);
 * await ctx.platform.vectorStore.upsert([...]);
 *
 * // Optional services - need check
 * if (ctx.platform.llm) {
 *   await ctx.platform.llm.complete(prompt);
 * }
 * ```
 */
export interface PlatformServices {
  // ═══════════════════════════════════════════════════════════════════════════
  // ADAPTER SERVICES (replaceable via kb.config.json)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Vector store for semantic search (e.g., Qdrant, Pinecone) */
  vectorStore?: IVectorStore;
  /** LLM for text generation (e.g., OpenAI, Anthropic) */
  llm?: ILLM;
  /** Embeddings for vector generation */
  embeddings?: IEmbeddings;
  /** Cache for fast key-value storage */
  cache?: ICache;
  /** Storage for file operations */
  storage?: IStorage;
  /** Structured logger */
  logger?: ILogger;
  /** Analytics for tracking events */
  analytics?: IAnalytics;
  /** Event bus for pub/sub */
  events?: IEventBus;
  /** Inter-plugin invocation */
  invoke?: IInvoke;
  /** Artifact storage for plugin outputs */
  artifacts?: IArtifacts;

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE FEATURES (built-in, not replaceable)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Workflow engine for multi-step orchestration */
  workflows?: IWorkflowEngine;
  /** Job scheduler for background tasks */
  jobs?: IJobScheduler;
  /** Cron manager for scheduled tasks */
  cron?: ICronManager;
  /** Resource manager for quota enforcement */
  resources?: IResourceManager;

  /**
   * Check if a service is explicitly configured (not using fallback).
   * @param service - Service name (e.g., 'llm', 'vectorStore', 'workflows')
   * @returns true if service is configured, false if using NoOp/fallback
   */
  isConfigured(service: string): boolean;
}

/**
 * Plugin context metadata.
 * Contains environment and execution context information.
 */
export interface PluginContextMetadata {
  /** Current working directory */
  cwd?: string;
  /** Output directory for generated files */
  outdir?: string;
  /** Workflow run identifier (when executed via workflow host) */
  runId?: string;
  /** Workflow step identifier */
  stepId?: string;
  /** Additional host-specific metadata */
  [key: string]: unknown;
}

/**
 * Context for plugin commands.
 *
 * Used by:
 * - defineCommand() handlers (CLI adapter)
 * - definePluginHandler() handlers (REST adapter)
 *
 * The context provides:
 * - Plugin identity (pluginId, version, requestId)
 * - UI output abstraction (ctx.ui)
 * - Platform services (ctx.platform)
 * - Execution metadata (ctx.metadata)
 * - Auto-loaded product configuration (ctx.config)
 *
 * @example
 * ```typescript
 * import { defineCommand, type PluginContext } from '@kb-labs/plugin-runtime';
 *
 * export const run = defineCommand({
 *   name: 'mind:rag-index',
 *   async handler(ctx: PluginContext, argv, flags) {
 *     ctx.ui.message('Starting indexing...');
 *
 *     // Platform services (declared in manifest.platform.requires)
 *     const embedding = await ctx.platform.embeddings.embed(text);
 *     await ctx.platform.vectorStore.upsert([{ id: 'doc', vector: embedding }]);
 *
 *     // Optional services (declared in manifest.platform.optional)
 *     if (ctx.platform.llm) {
 *       const summary = await ctx.platform.llm.complete('Summarize...');
 *     }
 *
 *     ctx.ui.message('Done!');
 *   }
 * });
 * ```
 */
export interface PluginContext<TConfig = any> {
  /** Execution host type (cli, rest, workflow, daemon) */
  readonly host: PluginHostType;
  /** Unique request identifier */
  readonly requestId: string;
  /** Plugin identifier */
  readonly pluginId: string;
  /** Plugin version */
  readonly pluginVersion: string;
  /** Tenant identifier (for multi-tenancy) */
  readonly tenantId?: string;

  /**
   * Resolved product configuration.
   *
   * Automatically loaded with:
   * - Profile selection (--profile flag or KB_PROFILE env var)
   * - Scope selection (based on cwd/executionPath)
   * - All merge layers (runtime → profile → profile-scope → workspace → CLI)
   *
   * @example
   * ```typescript
   * interface MyProductConfig {
   *   engine: 'openai' | 'anthropic';
   *   maxComments: number;
   * }
   *
   * export const run = defineCommand({
   *   async handler(ctx: PluginContext<MyProductConfig>) {
   *     const engine = ctx.config.engine; // typed!
   *     const maxComments = ctx.config.maxComments;
   *   }
   * });
   * ```
   */
  readonly config?: TConfig;

  /**
   * UI output facade.
   * Use for all user-facing output.
   */
  readonly ui: UIFacade;

  /**
   * Platform services.
   * Access infrastructure through this object.
   */
  readonly platform: PlatformServices;

  /**
   * Execution metadata.
   * Contains cwd, outdir, runId, stepId, etc.
   */
  readonly metadata: PluginContextMetadata;

  // ═══════════════════════════════════════════════════════════════════════════
  // DEPRECATED - for backward compatibility only
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * @deprecated Use ctx.ui instead. Will be removed in v1.0.
   */
  readonly presenter: PresenterFacade;
}

/**
 * Options for creating PluginContext.
 */
export interface PluginContextOptions<TConfig = any> {
  requestId: string;
  pluginId: string;
  pluginVersion: string;
  tenantId?: string;
  /** UI facade (presenter) */
  ui?: UIFacade;
  /** Platform services */
  platform?: Partial<PlatformServices>;
  /** Execution metadata */
  metadata?: PluginContextMetadata;
  /** Resolved product configuration */
  config?: TConfig;
}

/**
 * Create a unified `PluginContext` for the specified host.
 */
export function createPluginContext<TConfig = any>(
  host: PluginHostType,
  options: PluginContextOptions<TConfig>
): PluginContext<TConfig> {
  const ui = options.ui ?? createNoopUI();
  const metadata: PluginContextMetadata = options.metadata ?? {};

  // Merge provided platform services with default isConfigured implementation
  const platform: PlatformServices = {
    ...options.platform,
    // Default isConfigured implementation
    isConfigured: options.platform?.isConfigured ?? (() => false),
  };

  return Object.freeze({
    host,
    requestId: options.requestId,
    pluginId: options.pluginId,
    pluginVersion: options.pluginVersion,
    tenantId: options.tenantId,
    config: options.config,
    ui,
    platform,
    metadata,
    // Backward compatibility
    presenter: ui,
  }) satisfies PluginContext<TConfig>;
}

// Re-export types
export type {
  PresenterFacade,
  PresenterProgressPayload,
};

// Re-export platform types for convenience
export type {
  IVectorStore,
  ILLM,
  IEmbeddings,
  ICache,
  IStorage,
  ILogger,
  IEventBus,
  IInvoke,
  IArtifacts,
  IAnalytics,
  IWorkflowEngine,
  IJobScheduler,
  ICronManager,
  IResourceManager,
} from '@kb-labs/core-platform';
