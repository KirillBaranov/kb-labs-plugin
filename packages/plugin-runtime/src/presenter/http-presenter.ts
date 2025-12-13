/**
 * @module @kb-labs/plugin-runtime/presenter/http-presenter
 * Presenter implementation for REST/API hosts (buffers events for SSE/JSON).
 */

import {
  type PresenterFacade,
  type PresenterMessageOptions,
  type PresenterProgressPayload,
  type PresenterEventPayload,
  type UIFacade,
  type UIColors,
  type UISymbols,
} from './presenter-facade';

export interface HttpPresenterOptions {
  /**
   * Called whenever a new event is produced. The REST host can push the event
   * to a Server-Sent Events stream or other transport.
   */
  onEvent?: (event: PresenterEventPayload) => void | Promise<void>;
  /**
   * Whether to keep buffered events for later retrieval (default: true).
   */
  buffer?: boolean;
  timestamp?: () => string;
}

function defaultTimestamp(): string {
  return new Date().toISOString();
}

export class HttpPresenter implements UIFacade {
  private readonly events: PresenterEventPayload[] = [];
  private readonly onEvent?: (event: PresenterEventPayload) => void | Promise<void>;
  private readonly timestamp: () => string;
  private readonly buffer: boolean;

  // UIFacade properties - no-op implementations for REST/API context
  readonly colors: UIColors = {
    // Semantic colors (pass-through)
    success: (s: string) => s,
    error: (s: string) => s,
    warning: (s: string) => s,
    info: (s: string) => s,
    // Accent palette (pass-through)
    primary: (s: string) => s,
    accent: (s: string) => s,
    highlight: (s: string) => s,
    secondary: (s: string) => s,
    emphasis: (s: string) => s,
    muted: (s: string) => s,
    foreground: (s: string) => s,
    // Formatting (pass-through)
    dim: (s: string) => s,
    bold: (s: string) => s,
    underline: (s: string) => s,
    inverse: (s: string) => s,
  };

  readonly symbols: UISymbols = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
    bullet: '•',
    pointer: '▸',
    separator: '│',
    border: '─',
  };

  constructor(options: HttpPresenterOptions = {}) {
    this.onEvent = options.onEvent;
    this.timestamp = options.timestamp ?? defaultTimestamp;
    this.buffer = options.buffer ?? true;
  }

  message(text: string, options?: PresenterMessageOptions): void {
    this.push({
      type: 'message',
      text,
      options,
      timestamp: this.timestamp(),
    });
  }

  progress(update: PresenterProgressPayload): void {
    this.push({
      type: 'progress',
      update,
      timestamp: this.timestamp(),
    });
  }

  json(data: unknown): void {
    this.push({
      type: 'json',
      data,
      timestamp: this.timestamp(),
    });
  }

  error(error: unknown, meta?: Record<string, unknown>): void {
    this.push({
      type: 'error',
      error,
      meta,
      timestamp: this.timestamp(),
    });
  }

  async confirm(_message: string, options?: { default?: boolean }): Promise<boolean> {
    // Non-interactive context - return default or false
    return options?.default ?? false;
  }

  // High-level result methods - no-op in REST context
  success(): void {
    // REST doesn't show UI - no-op
  }

  showError(): void {
    // REST doesn't show UI - no-op
  }

  warning(): void {
    // REST doesn't show UI - no-op
  }

  info(): void {
    // REST doesn't show UI - no-op
  }

  // Progress helpers - no-op in REST context
  startProgress(): void {
    // REST doesn't show UI - no-op
  }

  updateProgress(): void {
    // REST doesn't show UI - no-op
  }

  completeProgress(): void {
    // REST doesn't show UI - no-op
  }

  failProgress(): void {
    // REST doesn't show UI - no-op
  }

  // Low-level formatting - no-op in REST context (return empty strings/arrays)
  headline(): void {
    // REST doesn't show UI - no-op
  }

  box(): string {
    // REST doesn't show UI - return empty
    return '';
  }

  sideBox(): string {
    // REST doesn't show UI - return empty
    return '';
  }

  section(): void {
    // REST doesn't show UI - no-op
  }

  table(): string[] {
    // REST doesn't show UI - return empty
    return [];
  }

  keyValue(): string[] {
    // REST doesn't show UI - return empty
    return [];
  }

  list(): string[] {
    // REST doesn't show UI - return empty
    return [];
  }

  spinner(): import('./presenter-facade').Spinner {
    // Return noop spinner for REST
    return {
      start: () => {},
      stop: () => {},
      update: () => {},
      succeed: () => {},
      fail: () => {},
    };
  }

  write(): void {
    // REST doesn't write raw text - no-op
  }

  /**
   * Retrieve buffered events for inclusion in synchronous REST responses.
   */
  drain(): PresenterEventPayload[] {
    return [...this.events];
  }

  private push(event: PresenterEventPayload): void {
    if (this.buffer) {
      this.events.push(event);
    }

    if (this.onEvent) {
      void Promise.resolve(this.onEvent(event)).catch(() => {
        // Silently ignore downstream errors; host code can override if needed.
      });
    }
  }
}


