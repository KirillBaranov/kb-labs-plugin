/**
 * PluginContext V2 - Unified context for all command handlers
 *
 * This is the next generation of PluginContext with improved structure and type safety.
 *
 * ## Breaking changes from V1:
 * - `cwd` and `outdir` promoted from `metadata` to top-level fields
 * - `runtime` field added for sandbox API access (fs, config, state)
 * - `ui` replaces `presenter` as primary output API (presenter deprecated)
 * - `platform` services always available (but individual services may be undefined)
 *
 * ## Backward compatibility:
 * - V1 type alias still available: `type PluginContext<T> = PluginContextV2<T>`
 * - All existing handlers continue to work without changes
 *
 * @module @kb-labs/plugin-runtime/context/plugin-context-v2
 * @version 2.0.0
 * @since 2025-12-12
 */

import type { PluginHostType } from './host';
import type { UIFacade, PresenterFacade } from '../presenter/presenter-facade';
import type { PlatformServices } from './plugin-context';

/**
 * Runtime Adapter - Sandbox API for plugin handlers
 *
 * Provides safe, scoped access to runtime services:
 * - **File system**: Sandboxed to cwd/outdir directories
 * - **Configuration**: Scoped to current product/scope
 * - **State broker**: Tenant-aware with namespace isolation
 *
 * ## Availability:
 * - ✅ CLI commands (full access)
 * - ✅ REST handlers (full access)
 * - ✅ Job handlers (full access)
 * - ❌ System commands (not available - use platform services instead)
 *
 * ## Example:
 * ```typescript
 * async handler(ctx: PluginContextV2) {
 *   // Check availability
 *   if (!ctx.runtime?.fs) {
 *     throw new Error('File system not available');
 *   }
 *
 *   // Use sandboxed fs (limited to cwd/outdir)
 *   const data = await ctx.runtime.fs.readFile('config.json', 'utf-8');
 *
 *   // Use state broker (tenant-aware)
 *   await ctx.runtime.state?.set('cache-key', data, 60000);
 * }
 * ```
 */
export interface RuntimeAdapter {
  /**
   * File system access (sandboxed)
   *
   * Scoped to:
   * - Read: anywhere within `cwd`
   * - Write: only within `outdir` (if specified)
   *
   * Methods: readFile, writeFile, readdir, stat, etc.
   */
  fs?: {
    readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer>;
    writeFile(path: string, data: string | Buffer): Promise<void>;
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
    exists(path: string): Promise<boolean>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  };

  /**
   * Configuration manager (scoped to product)
   *
   * Access to product configuration with:
   * - Profile selection (--profile flag or KB_PROFILE env)
   * - Scope selection (based on cwd)
   * - Merge layers (runtime → profile → workspace)
   *
   * Methods: get, set, has, update, etc.
   */
  config?: {
    get<T = unknown>(key: string): T | undefined;
    set<T = unknown>(key: string, value: T): Promise<void>;
    has(key: string): boolean;
    update<T = unknown>(updater: (current: T | undefined) => T): Promise<void>;
  };

  /**
   * State broker (tenant-aware)
   *
   * Fast in-memory cache with:
   * - TTL support (automatic expiration)
   * - Namespace isolation (per plugin)
   * - Tenant awareness (multi-tenancy ready)
   * - 10-50x faster than file-based cache
   *
   * Methods: get, set, delete, has, etc.
   */
  state?: {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;
    delete(key: string): Promise<boolean>;
    has(key: string): Promise<boolean>;
    clear(): Promise<void>;
  };
}

/**
 * Plugin Context Metadata - Host-specific additional data
 *
 * Used for data that is specific to the execution host (CLI, REST, Workflow).
 * Base fields like `cwd` and `outdir` have been promoted to top-level in V2.
 *
 * ## CLI metadata:
 * - `flags`: Parsed command-line flags
 * - `jsonMode`: Whether --json flag was passed
 *
 * ## REST metadata:
 * - `method`: HTTP method (GET, POST, etc.)
 * - `path`: Request path
 * - `basePath`: API base path
 *
 * ## Workflow metadata:
 * - `runId`: Workflow run identifier
 * - `stepId`: Workflow step identifier
 */
export interface PluginContextMetadata {
  /**
   * Workflow run identifier (when executed via workflow host)
   * @deprecated Access via ctx.metadata.runId in workflow handlers
   */
  runId?: string;

  /**
   * Workflow step identifier
   * @deprecated Access via ctx.metadata.stepId in workflow handlers
   */
  stepId?: string;

  /**
   * Additional host-specific metadata
   * Extend this interface for custom fields
   */
  [key: string]: unknown;
}

/**
 * PluginContext V2 - Unified context for all command handlers
 *
 * This context is passed to:
 * - `defineCommand()` handlers (CLI)
 * - `defineSystemCommand()` handlers (CLI system commands)
 * - `definePluginHandler()` handlers (REST API)
 * - Job handlers (background jobs)
 *
 * ## Key features:
 * - **Unified across all hosts** - Same API in CLI, REST, Jobs
 * - **Type-safe configuration** - Generic TConfig for product config
 * - **Platform services** - Access to llm, vectorStore, embeddings, etc.
 * - **Sandbox runtime** - Safe fs, config, state access
 * - **Multi-tenancy ready** - tenantId field for SaaS deployments
 *
 * @example
 * ```typescript
 * import { defineCommand, type PluginContextV2 } from '@kb-labs/shared-command-kit';
 *
 * interface MyConfig {
 *   engine: 'openai' | 'anthropic';
 *   maxTokens: number;
 * }
 *
 * export const run = defineCommand<MyConfig>({
 *   name: 'my:command',
 *   async handler(ctx, argv, flags) {
 *     // ✅ Type-safe config access
 *     const engine = ctx.config?.engine; // 'openai' | 'anthropic' | undefined
 *
 *     // ✅ Direct cwd access (promoted from metadata)
 *     console.log('Working in:', ctx.cwd);
 *
 *     // ✅ Platform services
 *     if (ctx.platform.llm) {
 *       const result = await ctx.platform.llm.complete('prompt');
 *     }
 *
 *     // ✅ Sandbox runtime (new in V2!)
 *     if (ctx.runtime?.fs) {
 *       const data = await ctx.runtime.fs.readFile('config.json', 'utf-8');
 *     }
 *
 *     return { ok: true };
 *   }
 * });
 * ```
 */
export interface PluginContextV2<TConfig = any> {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE METADATA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execution host type
   *
   * Values:
   * - `'cli'` - Command-line interface
   * - `'rest'` - REST API handler
   * - `'workflow'` - Workflow step
   * - `'daemon'` - Background daemon
   */
  readonly host: PluginHostType;

  /**
   * Unique request identifier
   *
   * Format: `req-{uuid}`
   * Used for: Tracing, logging, correlation across services
   */
  readonly requestId: string;

  /**
   * Plugin identifier
   *
   * Format: `@kb-labs/plugin-name`
   * Matches package.json name field
   */
  readonly pluginId: string;

  /**
   * Plugin version
   *
   * Format: Semantic version (e.g., `1.2.3`)
   * Matches package.json version field
   */
  readonly pluginVersion: string;

  /**
   * Tenant identifier (for multi-tenancy)
   *
   * Used for:
   * - Rate limiting (per tenant)
   * - State isolation (tenant-aware cache)
   * - Analytics (tenant-scoped metrics)
   *
   * @default 'default' (single-tenant mode)
   */
  readonly tenantId?: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION ENVIRONMENT (promoted from metadata in V2!)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Current working directory
   *
   * **⬆️ PROMOTED FROM METADATA IN V2**
   *
   * In V1: `ctx.metadata?.cwd ?? '.'`
   * In V2: `ctx.cwd` (always defined)
   *
   * Default: process.cwd() at command invocation
   * Can be overridden via --cwd flag (CLI) or API param (REST)
   */
  readonly cwd: string;

  /**
   * Output directory for generated files
   *
   * **⬆️ PROMOTED FROM METADATA IN V2**
   *
   * In V1: `ctx.metadata?.outdir`
   * In V2: `ctx.outdir` (optional, top-level)
   *
   * Used for:
   * - Generated code output
   * - Report files
   * - Build artifacts
   *
   * Sandbox: ctx.runtime.fs.writeFile() respects this directory
   */
  readonly outdir?: string;

  // ═══════════════════════════════════════════════════════════════════════════
  // CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Product configuration (auto-loaded from kb.config.json)
   *
   * **Type-safe when TConfig specified:**
   * ```typescript
   * defineCommand<MyConfig>({
   *   async handler(ctx) {
   *     ctx.config // MyConfig | undefined (typed!)
   *   }
   * })
   * ```
   *
   * **Merge layers (in order):**
   * 1. Runtime defaults
   * 2. Profile config (from kb.config.json profiles)
   * 3. Profile-scoped config (profile + scope combination)
   * 4. Workspace config
   * 5. CLI flags (highest priority)
   *
   * **Profile selection:**
   * - `--profile prod` flag
   * - `KB_PROFILE=prod` env variable
   * - Default: "default" profile
   *
   * **Scope selection:**
   * - Based on cwd or --executionPath
   * - Matches against scope patterns in config
   */
  readonly config?: TConfig;

  // ═══════════════════════════════════════════════════════════════════════════
  // UI & OUTPUT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * UI output facade (primary API)
   *
   * **Recommended over presenter** - consistent API across CLI/REST
   *
   * Methods:
   * - `message(text)` - User-facing message
   * - `error(text)` - Error message
   * - `warning(text)` - Warning message
   * - `progress(payload)` - Progress updates
   *
   * CLI: Writes to stdout/stderr with colors
   * REST: Logs to logger (no terminal output)
   *
   * @example
   * ```typescript
   * ctx.ui.message('Processing...');
   * ctx.ui.progress({ current: 5, total: 10 });
   * ```
   */
  readonly ui: UIFacade;

  /**
   * Presenter facade (legacy output API)
   *
   * @deprecated Use `ctx.ui` instead. Will be removed in v3.0.
   *
   * Migration:
   * - `ctx.presenter.success()` → `ctx.ui.message()`
   * - `ctx.presenter.error()` → `ctx.ui.error()`
   */
  readonly presenter: PresenterFacade;

  /**
   * Output interface (from @kb-labs/core-sys)
   *
   * @deprecated Use `ctx.ui` instead. Will be removed in v3.0.
   *
   * Migration:
   * - `ctx.output.success()` → `ctx.ui.success()`
   * - `ctx.output.error()` → `ctx.ui.showError()`
   * - `ctx.output.ui.sideBox()` → `ctx.ui.sideBox()`
   *
   * Backward compatibility field from CliContextV1.
   */
  readonly output?: any;

  /**
   * Structured logger interface (from @kb-labs/core-sys)
   * For advanced logging use cases.
   *
   * Backward compatibility field from CliContextV1.
   * In V2: Use `ctx.platform.logger` instead.
   */
  readonly logger?: any;

  // ═══════════════════════════════════════════════════════════════════════════
  // PLATFORM SERVICES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Platform services (llm, vectorStore, embeddings, etc.)
   *
   * **Always available object**, but individual services may be undefined.
   * Use `platform.isConfigured('llm')` to check before using.
   *
   * ## Available services:
   * - `llm` - Language model (OpenAI, Anthropic, etc.)
   * - `embeddings` - Text embeddings
   * - `vectorStore` - Vector database (Qdrant, local, etc.)
   * - `storage` - File/blob storage
   * - `cache` - Caching layer (Redis, in-memory)
   * - `logger` - Structured logging
   * - `analytics` - Telemetry/analytics
   *
   * ## Example:
   * ```typescript
   * // Check availability
   * if (ctx.platform.isConfigured('llm')) {
   *   const result = await ctx.platform.llm.complete('prompt');
   * } else {
   *   // Fallback to deterministic algorithm
   * }
   * ```
   *
   * ## Configuration:
   * Services are configured in:
   * - Environment variables (OPENAI_API_KEY, QDRANT_URL, etc.)
   * - kb.config.json platform section
   * - Plugin manifest platform.requires/optional
   */
  readonly platform: PlatformServices;

  /**
   * Runtime sandbox API (fs, config, state brokers)
   *
   * **⬆️ NEW IN V2**
   *
   * Provides sandboxed access to:
   * - File system (scoped to cwd/outdir)
   * - Configuration (product-scoped)
   * - State broker (tenant-aware cache)
   *
   * ## Availability:
   * - ✅ CLI commands
   * - ✅ REST handlers
   * - ✅ Job handlers
   * - ❌ System commands (use platform services instead)
   *
   * ## Example:
   * ```typescript
   * if (ctx.runtime?.fs) {
   *   // Sandboxed read (anywhere in cwd)
   *   const data = await ctx.runtime.fs.readFile('config.json', 'utf-8');
   *
   *   // Sandboxed write (only in outdir)
   *   await ctx.runtime.fs.writeFile('output/result.json', JSON.stringify(data));
   * }
   *
   * if (ctx.runtime?.state) {
   *   // Fast in-memory cache with TTL
   *   await ctx.runtime.state.set('query-result', result, 60000);
   *   const cached = await ctx.runtime.state.get('query-result');
   * }
   * ```
   */
  readonly runtime?: RuntimeAdapter;

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL METADATA (host-specific)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Additional host-specific metadata
   *
   * **Base fields promoted to top-level in V2:**
   * - ~~`cwd`~~ → `ctx.cwd` (top-level)
   * - ~~`outdir`~~ → `ctx.outdir` (top-level)
   *
   * **Remaining host-specific fields:**
   *
   * CLI:
   * - `flags: Record<string, unknown>` - Parsed CLI flags
   * - `jsonMode: boolean` - --json flag passed
   *
   * REST:
   * - `method: string` - HTTP method (GET, POST, etc.)
   * - `path: string` - Request path
   * - `basePath: string` - API base path
   *
   * Workflow:
   * - `runId: string` - Workflow run ID
   * - `stepId: string` - Workflow step ID
   */
  readonly metadata?: PluginContextMetadata;
}
