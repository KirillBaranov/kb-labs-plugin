/**
 * Platform Services for V3 Plugin System
 *
 * Governed access to platform capabilities: LLM, embeddings, vector store, cache, storage, analytics.
 * In sandbox mode, these are RPC proxies to the parent process.
 *
 * IMPORTANT: V3 directly uses core platform contracts - no wrappers, no adapters.
 * Platform provides services, runtime just passes them through.
 */

// Re-export core platform adapter interfaces directly
export type {
  ILogger as Logger,
  ICache as CacheAdapter,
  ILLM as LLMAdapter,
  IEmbeddings as EmbeddingsAdapter,
  IVectorStore as VectorStoreAdapter,
  IStorage as StorageAdapter,
  IAnalytics as AnalyticsAdapter,
  // Re-export supporting types
  LLMOptions,
  LLMResponse,
  VectorRecord,
  VectorSearchResult,
  VectorFilter,
} from '@kb-labs/core-platform/adapters';

// ============================================================================
// Platform Services
// ============================================================================

/**
 * Platform services interface
 *
 * All platform services governed by permissions.
 * Services are provided by platform container, runtime passes them through.
 */
export interface PlatformServices {
  /**
   * Structured logger (core ILogger)
   */
  readonly logger: ILogger;

  /**
   * LLM access (core ILLM)
   * Requires platform.llm permission
   */
  readonly llm: ILLM;

  /**
   * Embeddings access (core IEmbeddings)
   * Requires platform.embeddings permission
   */
  readonly embeddings: IEmbeddings;

  /**
   * Vector store access (core IVectorStore)
   * Requires platform.vectorStore permission
   */
  readonly vectorStore: IVectorStore;

  /**
   * Cache access (core ICache)
   * Requires platform.cache permission
   */
  readonly cache: ICache;

  /**
   * Storage access (core IStorage)
   * Requires platform.storage permission
   */
  readonly storage: IStorage;

  /**
   * Analytics access (core IAnalytics)
   * Requires platform.analytics permission
   */
  readonly analytics: IAnalytics;
}

// Import types for PlatformServices fields
import type {
  ILogger,
  ICache,
  ILLM,
  IEmbeddings,
  IVectorStore,
  IStorage,
  IAnalytics,
} from '@kb-labs/core-platform/adapters';
