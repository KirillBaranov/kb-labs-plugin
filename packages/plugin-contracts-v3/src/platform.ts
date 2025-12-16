/**
 * Platform Services for V3 Plugin System
 *
 * Governed access to platform capabilities: LLM, embeddings, vector store, cache, storage, analytics.
 * In sandbox mode, these are RPC proxies to the parent process.
 */

// ============================================================================
// Logger
// ============================================================================

/**
 * Structured logger interface
 */
export interface Logger {
  /**
   * Debug level log (only shown in verbose mode)
   */
  debug(message: string, meta?: Record<string, unknown>): void;

  /**
   * Info level log
   */
  info(message: string, meta?: Record<string, unknown>): void;

  /**
   * Warning level log
   */
  warn(message: string, meta?: Record<string, unknown>): void;

  /**
   * Error level log
   */
  error(message: string, meta?: Record<string, unknown>): void;

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): Logger;
}

// ============================================================================
// LLM
// ============================================================================

/**
 * LLM message
 */
export interface LLMMessage {
  /**
   * Message role
   */
  role: 'system' | 'user' | 'assistant';

  /**
   * Message content
   */
  content: string;
}

/**
 * LLM chat options
 */
export interface LLMOptions {
  /**
   * Model to use (e.g., 'gpt-4', 'claude-3-opus')
   */
  model?: string;

  /**
   * Temperature (0-2, default: 1)
   */
  temperature?: number;

  /**
   * Maximum tokens to generate
   */
  maxTokens?: number;

  /**
   * Stop sequences
   */
  stop?: string[];

  /**
   * Top-p (nucleus sampling)
   */
  topP?: number;

  /**
   * Frequency penalty
   */
  frequencyPenalty?: number;

  /**
   * Presence penalty
   */
  presencePenalty?: number;
}

/**
 * LLM response
 */
export interface LLMResponse {
  /**
   * Generated content
   */
  content: string;

  /**
   * Finish reason
   */
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls';

  /**
   * Token usage
   */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens?: number;
  };
}

/**
 * LLM adapter interface
 */
export interface LLMAdapter {
  /**
   * Send chat completion request
   */
  chat(messages: LLMMessage[], options?: LLMOptions): Promise<LLMResponse>;
}

// ============================================================================
// Embeddings
// ============================================================================

/**
 * Embeddings adapter interface
 */
export interface EmbeddingsAdapter {
  /**
   * Generate embeddings for text(s)
   *
   * @param text Single text or array of texts
   * @returns Array of embedding vectors
   */
  embed(text: string | string[]): Promise<number[][]>;
}

// ============================================================================
// Vector Store
// ============================================================================

/**
 * Vector search options
 */
export interface VectorSearchOptions {
  /**
   * Maximum number of results
   */
  limit?: number;

  /**
   * Minimum similarity score
   */
  minScore?: number;

  /**
   * Metadata filter
   */
  filter?: Record<string, unknown>;

  /**
   * Include vectors in results
   */
  includeVectors?: boolean;
}

/**
 * Vector search result
 */
export interface VectorSearchResult {
  /**
   * Vector ID
   */
  id: string;

  /**
   * Similarity score
   */
  score: number;

  /**
   * Associated payload/metadata
   */
  payload?: Record<string, unknown>;

  /**
   * Vector (if includeVectors was true)
   */
  vector?: number[];
}

/**
 * Vector store adapter interface
 */
export interface VectorStoreAdapter {
  /**
   * Search for similar vectors
   */
  search(query: number[], options?: VectorSearchOptions): Promise<VectorSearchResult[]>;

  /**
   * Upsert vectors
   */
  upsert?(
    vectors: Array<{
      id: string;
      vector: number[];
      payload?: Record<string, unknown>;
    }>
  ): Promise<void>;

  /**
   * Delete vectors by ID
   */
  delete?(ids: string[]): Promise<void>;
}

// ============================================================================
// Cache
// ============================================================================

/**
 * Cache adapter interface
 */
export interface CacheAdapter {
  /**
   * Get value from cache
   *
   * @param key Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * Set value in cache
   *
   * @param key Cache key
   * @param value Value to cache
   * @param ttlMs Time to live in milliseconds (optional)
   */
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;

  /**
   * Delete value from cache
   *
   * @param key Cache key
   */
  delete(key: string): Promise<void>;

  /**
   * Check if key exists in cache
   *
   * @param key Cache key
   */
  has?(key: string): Promise<boolean>;
}

// ============================================================================
// Storage
// ============================================================================

/**
 * Storage adapter interface (for larger/persistent data)
 */
export interface StorageAdapter {
  /**
   * Read file from storage
   *
   * @param path Storage path
   * @returns File contents as Buffer
   */
  read(path: string): Promise<Uint8Array>;

  /**
   * Write file to storage
   *
   * @param path Storage path
   * @param data Data to write
   */
  write(path: string, data: Uint8Array): Promise<void>;

  /**
   * Delete file from storage
   *
   * @param path Storage path
   */
  delete(path: string): Promise<void>;

  /**
   * Check if file exists in storage
   *
   * @param path Storage path
   */
  exists(path: string): Promise<boolean>;

  /**
   * List files in storage path
   *
   * @param prefix Path prefix
   */
  list?(prefix: string): Promise<string[]>;
}

// ============================================================================
// Analytics
// ============================================================================

/**
 * Analytics adapter interface
 */
export interface AnalyticsAdapter {
  /**
   * Track an event
   *
   * @param event Event name
   * @param properties Event properties
   */
  track(event: string, properties?: Record<string, unknown>): Promise<void>;
}

// ============================================================================
// Platform Services
// ============================================================================

/**
 * Platform services interface
 *
 * All platform services governed by permissions.
 */
export interface PlatformServices {
  /**
   * Structured logger
   */
  readonly logger: Logger;

  /**
   * LLM access (requires platform.llm permission)
   */
  readonly llm: LLMAdapter;

  /**
   * Embeddings access (requires platform.embeddings permission)
   */
  readonly embeddings: EmbeddingsAdapter;

  /**
   * Vector store access (requires platform.vectorStore permission)
   */
  readonly vectorStore: VectorStoreAdapter;

  /**
   * Cache access (requires platform.cache permission)
   */
  readonly cache: CacheAdapter;

  /**
   * Storage access (requires platform.storage permission)
   */
  readonly storage: StorageAdapter;

  /**
   * Analytics access (requires platform.analytics permission)
   */
  readonly analytics: AnalyticsAdapter;
}
