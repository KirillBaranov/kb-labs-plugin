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
import type { RuntimeAdapter, PluginContextV2 } from './plugin-context-v2';

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

// Old PluginContext V1 interface removed - now replaced with type alias to V2
// See bottom of file for backward compatibility alias: export type PluginContext<T> = PluginContextV2<T>

/**
 * Options for creating PluginContext V2.
 */
export interface PluginContextOptions<TConfig = any> {
  requestId: string;
  pluginId: string;
  pluginVersion: string;
  tenantId?: string;

  /** Current working directory (promoted to top-level in V2) */
  cwd?: string;

  /** Output directory for generated files (promoted to top-level in V2) */
  outdir?: string;

  /** UI facade (presenter) */
  ui?: UIFacade;

  /** Platform services */
  platform?: Partial<PlatformServices>;

  /** Runtime sandbox API (NEW in V2) */
  runtime?: RuntimeAdapter;

  /** Execution metadata (host-specific fields only) */
  metadata?: PluginContextMetadata;

  /** Resolved product configuration */
  config?: TConfig;
}

/**
 * Create a unified `PluginContext` V2 for the specified host.
 *
 * **Changes in V2:**
 * - Returns PluginContextV2 (same as PluginContext, but semantically versioned)
 * - `cwd` and `outdir` promoted from metadata to top-level options
 * - `runtime` field added for sandbox API access
 * - `metadata` now contains ONLY host-specific fields
 *
 * @param host - Execution host type (cli, rest, workflow, daemon)
 * @param options - Context creation options
 * @returns Frozen PluginContext V2 object
 */
export function createPluginContext<TConfig = any>(
  host: PluginHostType,
  options: PluginContextOptions<TConfig>
): PluginContextV2<TConfig> {
  const ui = options.ui ?? createNoopUI();

  // Extract cwd/outdir from options (V2: promoted to top-level!)
  const cwd = options.cwd ?? process.cwd();
  const outdir = options.outdir;

  // Runtime sandbox API (V2: new field!)
  const runtime = options.runtime;

  // metadata is now ONLY for host-specific fields (V2: cleaned up!)
  const metadata: PluginContextMetadata = options.metadata ?? {};

  // Merge provided platform services with default isConfigured implementation
  const platform: PlatformServices = {
    ...options.platform,
    // Default isConfigured implementation
    isConfigured: options.platform?.isConfigured ?? (() => false),
  } as PlatformServices;

  // TODO: Re-enable Object.freeze() after debugging
  // Currently disabled because something tries to mutate the context
  return {
    host,
    requestId: options.requestId,
    pluginId: options.pluginId,
    pluginVersion: options.pluginVersion,
    tenantId: options.tenantId,
    cwd,          // V2: promoted to top-level
    outdir,        // V2: promoted to top-level
    config: options.config,
    ui,
    platform,
    runtime,       // V2: new field
    metadata,      // V2: only host-specific data
    // Backward compatibility
    presenter: ui,
  } satisfies PluginContextV2<TConfig>;
}

/**
 * PluginContext (V1 compatibility alias)
 *
 * @deprecated Use PluginContextV2 instead for new code.
 * This alias will be removed in v3.0.
 *
 * Migration:
 * ```typescript
 * // Old (still works):
 * import { type PluginContext } from '@kb-labs/plugin-runtime';
 *
 * // New (recommended):
 * import { type PluginContextV2 } from '@kb-labs/plugin-runtime';
 * ```
 */
export type PluginContext<TConfig = any> = PluginContextV2<TConfig>;

// Re-export V2 types (already imported at top of file)
export type {
  RuntimeAdapter,
  PluginContextMetadata as PluginContextMetadataV2,
} from './plugin-context-v2';

// Re-export UI types
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
