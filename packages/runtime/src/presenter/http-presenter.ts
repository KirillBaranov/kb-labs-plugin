/**
 * @module @kb-labs/plugin-runtime/presenter/http-presenter
 * Presenter implementation for REST/API hosts (buffers events for SSE/JSON).
 */

import {
  type PresenterFacade,
  type PresenterMessageOptions,
  type PresenterProgressPayload,
  type PresenterEventPayload,
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

export class HttpPresenter implements PresenterFacade {
  private readonly events: PresenterEventPayload[] = [];
  private readonly onEvent?: (event: PresenterEventPayload) => void | Promise<void>;
  private readonly timestamp: () => string;
  private readonly buffer: boolean;

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


