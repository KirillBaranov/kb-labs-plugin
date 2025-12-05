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

/**
 * UI facade for plugin output.
 * Extends PresenterFacade with rich formatting capabilities.
 */
export interface UIFacade extends PresenterFacade {
  // Semantic output
  success?(text: string): void;
  warning?(text: string): void;
  info?(text: string): void;

  // Formatted output
  headline?(text: string): void;
  box?(title: string, content?: string[], options?: BoxOptions): void;
  section?(header: string, content: string[]): void;
  table?(rows: TableRow[], headers?: string[]): void;
  keyValue?(pairs: Record<string, string | number>, options?: KeyValueOptions): void;
  list?(items: string[]): void;

  // Styling utilities
  readonly colors: UIColors;
  readonly symbols: UISymbols;
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

  success(): void {
    // intentionally empty
  }

  warning(): void {
    // intentionally empty
  }

  info(): void {
    // intentionally empty
  }

  headline(): void {
    // intentionally empty
  }

  box(): void {
    // intentionally empty
  }

  section(): void {
    // intentionally empty
  }

  table(): void {
    // intentionally empty
  }

  keyValue(): void {
    // intentionally empty
  }

  list(): void {
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

