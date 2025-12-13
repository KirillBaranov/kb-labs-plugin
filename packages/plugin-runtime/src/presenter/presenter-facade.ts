/**
 * @module @kb-labs/plugin-runtime/presenter/presenter-facade
 * Presenter facade interface and default implementations.
 */

export type PresenterMessageLevel = 'debug' | 'info' | 'warn' | 'error';

export interface PresenterMessageOptions {
  level?: PresenterMessageLevel;
  meta?: Record<string, unknown>;
}

export interface PresenterProgressPayload {
  stage: string;
  status?: 'pending' | 'running' | 'success' | 'warning' | 'failed';
  percent?: number;
  message?: string;
  meta?: Record<string, unknown>;
}

export type PresenterEventType = 'message' | 'progress' | 'json' | 'error';

export type PresenterEventPayload =
  | {
      type: 'message';
      text: string;
      options?: PresenterMessageOptions;
      timestamp: string;
    }
  | {
      type: 'progress';
      update: PresenterProgressPayload;
      timestamp: string;
    }
  | {
      type: 'json';
      data: unknown;
      timestamp: string;
    }
  | {
      type: 'error';
      error: unknown;
      meta?: Record<string, unknown>;
      timestamp: string;
    };

/**
 * Unified presenter interface that hosts implement to surface output to
 * humans or downstream tooling (CLI, REST, Studio, etc.).
 */
export interface ConfirmOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Default value if timeout (default: false) */
  default?: boolean;
}

export interface PresenterFacade {
  /**
   * Emit a textual message. Hosts decide how to render it (stdout, UI toast,
   * log aggregation, etc.).
   */
  message(text: string, options?: PresenterMessageOptions): void;

  /**
   * Report progress for a given workflow or command stage.
   */
  progress(update: PresenterProgressPayload): void;

  /**
   * Emit structured output (usually the final command result).
   */
  json(data: unknown): void;

  /**
   * Emit an error that should be surfaced prominently to the user.
   */
  error(error: unknown, meta?: Record<string, unknown>): void;

  /**
   * Request user confirmation (y/n). Returns true if confirmed, false otherwise.
   * For non-interactive environments, returns default value or false.
   */
  confirm?(message: string, options?: ConfirmOptions): Promise<boolean>;
}

/**
 * No-op presenter used when the host does not provide presenter capabilities.
 */
class NoopPresenter implements PresenterFacade {
  message(): void {
    // intentionally empty
  }

  progress(): void {
    // intentionally empty
  }

  json(): void {
    // intentionally empty
  }

  error(): void {
    // intentionally empty
  }

  async confirm(_message: string, options?: ConfirmOptions): Promise<boolean> {
    // Default deny for non-interactive environments
    return options?.default ?? false;
  }
}

const noopPresenterInstance = new NoopPresenter();

export function createNoopPresenter(): PresenterFacade {
  return noopPresenterInstance;
}

// ═══════════════════════════════════════════════════════════════════════════
// UI FACADE TYPES (extended presenter with rich formatting)
// ═══════════════════════════════════════════════════════════════════════════

/** Color function type */
export type ColorFn = (text: string) => string;

/** Available color palette */
export interface UIColors {
  // Semantic colors
  success: ColorFn;
  error: ColorFn;
  warning: ColorFn;
  info: ColorFn;
  // Accent palette
  primary: ColorFn;
  accent: ColorFn;
  highlight: ColorFn;
  secondary: ColorFn;
  emphasis: ColorFn;
  muted: ColorFn;
  foreground: ColorFn;
  // Formatting
  dim: ColorFn;
  bold: ColorFn;
  underline: ColorFn;
  inverse: ColorFn;
}

/** Available symbols */
export interface UISymbols {
  success: string;
  error: string;
  warning: string;
  info: string;
  bullet: string;
  pointer: string;
  separator: string;
  border: string;
}

/** Box options */
export interface BoxOptions {
  maxWidth?: number;
}

/** Table row type */
export type TableRow = (string | number)[];

/** Key-value pair options */
export interface KeyValueOptions {
  padKeys?: boolean;
  indent?: number;
}

/** SideBox section */
export interface SideBoxSection {
  header?: string;
  items: string[];
}

/** SideBox options */
export interface SideBoxOptions {
  title: string;
  sections: SideBoxSection[];
  status?: 'success' | 'error' | 'info' | 'warning';
  timing?: number;
}

/** Spinner interface for progress indicators */
export interface Spinner {
  start(): void;
  stop(): void;
  update(options: { text?: string }): void;
  succeed(message?: string): void;
  fail(message?: string): void;
}

/**
 * UI facade for plugin output.
 * Extends PresenterFacade with rich formatting capabilities.
 *
 * **Architecture**: Unified API for all output (replaces ctx.output from core-sys)
 * - High-level methods: auto-format + auto-log (success, error, warning, info)
 * - Low-level methods: format only, returns strings (sideBox, box, table, etc.)
 * - Styling utilities: colors, symbols
 * - Progress indicators: spinner, progress
 * - Output modes: json, write
 */
export interface UIFacade extends PresenterFacade {
  // ============================================================
  // HIGH-LEVEL API (auto-format + auto-log)
  // ============================================================

  /**
   * Display success message with formatting
   * Respects --quiet flag, always shown unless silenced
   *
   * @param title - Main title for the success message
   * @param data - Optional data (summary, sections, timing)
   *
   * @example
   * ```typescript
   * ctx.ui.success('Build Complete', {
   *   summary: { 'Files': 42, 'Duration': '1.2s' },
   *   sections: [{ header: 'Output', items: ['dist/index.js'] }],
   *   timing: 1200
   * });
   * ```
   */
  success?(title: string, data?: {
    summary?: Record<string, string | number>;
    sections?: Array<{ header?: string; items: string[] }>;
    timing?: number;
  }): void;

  /**
   * Display error message with formatting
   * Always shown (errors ignore --quiet)
   *
   * Note: Named showError() to avoid conflict with PresenterFacade.error()
   *
   * @param title - Main title for the error
   * @param error - Error object or string
   * @param options - Optional suggestions and timing
   *
   * @example
   * ```typescript
   * ctx.ui.showError('Build Failed', new Error('TypeScript errors'), {
   *   suggestions: ['Run tsc --noEmit', 'Check tsconfig.json'],
   *   timing: 500
   * });
   * ```
   */
  showError?(title: string, error: Error | string, options?: {
    suggestions?: string[];
    timing?: number;
  }): void;

  /**
   * Display warning message with formatting
   * Shown in normal/verbose modes
   *
   * @param title - Main title for the warning
   * @param warnings - Array of warning messages
   * @param options - Optional summary and timing
   *
   * @example
   * ```typescript
   * ctx.ui.warning('Deprecated APIs', [
   *   'Using old config format',
   *   'Migrate to new format soon'
   * ], { timing: 100 });
   * ```
   */
  warning?(title: string, warnings: string[], options?: {
    summary?: Record<string, string | number>;
    timing?: number;
  }): void;

  /**
   * Display info message with formatting
   * Only shown in --verbose mode
   *
   * @param title - Main title for the info
   * @param data - Optional data (summary, sections)
   *
   * @example
   * ```typescript
   * ctx.ui.info('Debug Info', {
   *   summary: { 'Cache hits': 95 }
   * });
   * ```
   */
  info?(title: string, data?: {
    summary?: Record<string, string | number>;
    sections?: Array<{ header?: string; items: string[] }>;
  }): void;

  // ============================================================
  // LOW-LEVEL API (format only, returns string)
  // ============================================================

  /**
   * Format a rich side box (returns string, doesn't log)
   * Use this when you need manual control over output
   *
   * @param options - SideBox configuration
   * @returns Formatted string ready to print
   *
   * @example
   * ```typescript
   * const box = ctx.ui.sideBox({
   *   title: 'Custom Output',
   *   sections: [{ items: ['Line 1', 'Line 2'] }],
   *   status: 'info'
   * });
   * console.log(box); // Manual output control
   * ```
   */
  sideBox?(options: SideBoxOptions): string;

  /**
   * Format a simple box (returns string)
   *
   * @param title - Box title
   * @param content - Array of content lines
   * @param options - Box formatting options
   * @returns Formatted box string
   */
  box?(title: string, content?: string[], options?: BoxOptions): string;

  /**
   * Format a table (returns string[])
   *
   * @param rows - Table rows (array of arrays)
   * @param headers - Optional header row
   * @returns Array of formatted table lines
   */
  table?(rows: TableRow[], headers?: string[]): string[];

  /**
   * Format key-value pairs (returns string[])
   *
   * @param pairs - Object with key-value pairs
   * @param options - Formatting options (padKeys, indent)
   * @returns Array of formatted lines
   */
  keyValue?(pairs: Record<string, string | number>, options?: KeyValueOptions): string[];

  /**
   * Format a list (returns string[])
   *
   * @param items - Array of list items
   * @returns Array of formatted list lines
   */
  list?(items: string[]): string[];

  /**
   * Format a headline (used for section headers)
   *
   * @param text - Headline text
   */
  headline?(text: string): void;

  /**
   * Format a section (header + content)
   *
   * @param header - Section header
   * @param content - Section content lines
   */
  section?(header: string, content: string[]): void;

  // ============================================================
  // STYLING UTILITIES
  // ============================================================

  /**
   * Color functions for text styling
   *
   * @example
   * ```typescript
   * const greenText = ctx.ui.colors.success('All good!');
   * const redText = ctx.ui.colors.error('Failed');
   * ```
   */
  readonly colors: UIColors;

  /**
   * Unicode symbols for visual indicators
   *
   * @example
   * ```typescript
   * const icon = ctx.ui.symbols.success; // '✓'
   * console.log(`${icon} Done!`);
   * ```
   */
  readonly symbols: UISymbols;

  // ============================================================
  // PROGRESS INDICATORS
  // ============================================================

  /**
   * Create a spinner for long-running tasks
   *
   * @param text - Initial spinner text
   * @returns Spinner instance with control methods
   *
   * @example
   * ```typescript
   * const spin = ctx.ui.spinner('Processing...');
   * // ... work ...
   * spin.succeed('Done!');
   * ```
   */
  spinner?(text: string): Spinner;

  /**
   * Report progress for workflow stages
   * Wrapper around PresenterFacade.progress()
   *
   * @param stage - Stage identifier
   * @param message - Progress message
   */
  startProgress?(stage: string, message: string): void;

  /**
   * Update progress for a stage
   *
   * @param stage - Stage identifier
   * @param message - Updated message
   * @param percent - Optional completion percentage
   */
  updateProgress?(stage: string, message: string, percent?: number): void;

  /**
   * Mark progress stage as complete
   *
   * @param stage - Stage identifier
   * @param message - Completion message
   */
  completeProgress?(stage: string, message: string): void;

  /**
   * Mark progress stage as failed
   *
   * @param stage - Stage identifier
   * @param message - Failure message
   */
  failProgress?(stage: string, message: string): void;

  // ============================================================
  // OUTPUT MODES
  // ============================================================

  /**
   * Write raw text to output (no formatting)
   * Useful for piping or custom output
   *
   * @param text - Raw text to write
   */
  write?(text: string): void;
}

// ═══════════════════════════════════════════════════════════════════════════
// NO-OP UI IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

/** Identity function for pass-through colors */
const identity: ColorFn = (text: string) => text;

/** Default colors (no-op, pass-through) */
const noopColors: UIColors = {
  // Semantic
  success: identity,
  error: identity,
  warning: identity,
  info: identity,
  // Accent
  primary: identity,
  accent: identity,
  highlight: identity,
  secondary: identity,
  emphasis: identity,
  muted: identity,
  foreground: identity,
  // Formatting
  dim: identity,
  bold: identity,
  underline: identity,
  inverse: identity,
};

/** Default symbols (ASCII fallback) */
const noopSymbols: UISymbols = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  bullet: '•',
  pointer: '›',
  separator: '─',
  border: '│',
};

/**
 * No-op UI facade with default colors and symbols.
 * Used when the host does not provide rich UI capabilities.
 */
class NoopUI implements UIFacade {
  readonly colors = noopColors;
  readonly symbols = noopSymbols;

  // PresenterFacade methods
  message(): void {
    // intentionally empty
  }

  progress(): void {
    // intentionally empty
  }

  json(): void {
    // intentionally empty
  }

  error(): void {
    // intentionally empty
  }

  async confirm(_message: string, options?: ConfirmOptions): Promise<boolean> {
    return options?.default ?? false;
  }

  // High-level output methods (NEW)
  success(): void {
    // intentionally empty
  }

  showError(): void {
    // intentionally empty
  }

  warning(): void {
    // intentionally empty
  }

  info(): void {
    // intentionally empty
  }

  // Low-level formatting methods
  sideBox(): string {
    // intentionally empty - return empty string
    return '';
  }

  box(): string {
    return '';
  }

  table(): string[] {
    return [];
  }

  keyValue(): string[] {
    return [];
  }

  list(): string[] {
    return [];
  }

  headline(): void {
    // intentionally empty
  }

  section(): void {
    // intentionally empty
  }

  // Progress methods
  spinner(): Spinner {
    // Return noop spinner
    return {
      start: () => {},
      stop: () => {},
      update: () => {},
      succeed: () => {},
      fail: () => {},
    };
  }

  startProgress(): void {
    // intentionally empty
  }

  updateProgress(): void {
    // intentionally empty
  }

  completeProgress(): void {
    // intentionally empty
  }

  failProgress(): void {
    // intentionally empty
  }

  // Output modes
  write(): void {
    // intentionally empty
  }
}

const noopUIInstance = new NoopUI();

/**
 * Create a no-op UI facade with default colors and symbols.
 * Use this when creating PluginContext without a real presenter.
 */
export function createNoopUI(): UIFacade {
  return noopUIInstance;
}

