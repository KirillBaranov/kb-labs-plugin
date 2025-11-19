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

