/**
 * @module @kb-labs/plugin-runtime/presenter/job-runner-presenter
 * Presenter implementation used inside workflow job runners.
 */

import {
  type PresenterFacade,
  type PresenterMessageOptions,
  type PresenterProgressPayload,
  type PresenterEventPayload,
} from './presenter-facade.js';

export type JobRunnerPresenterEvent = PresenterEventPayload & {
  runId?: string;
  stepId?: string;
};

export interface JobRunnerPresenterOptions {
  runId?: string;
  stepId?: string;
  /**
   * Callback invoked whenever a presenter event is produced. The workflow host
   * can use this to forward events to Redis, WebSocket clients, etc.
   */
  onEvent?: (event: JobRunnerPresenterEvent) => void | Promise<void>;
  /**
   * Whether to keep an in-memory buffer of events (useful for tests or for
   * hosts that read events after completion).
   */
  buffer?: boolean;
  timestamp?: () => string;
}

function defaultTimestamp(): string {
  return new Date().toISOString();
}

export class JobRunnerPresenter implements PresenterFacade {
  private readonly events: JobRunnerPresenterEvent[] = [];
  private readonly runId?: string;
  private readonly stepId?: string;
  private readonly onEvent?: (event: JobRunnerPresenterEvent) => void | Promise<void>;
  private readonly timestamp: () => string;
  private readonly buffer: boolean;

  constructor(options: JobRunnerPresenterOptions = {}) {
    this.runId = options.runId;
    this.stepId = options.stepId;
    this.onEvent = options.onEvent;
    this.buffer = options.buffer ?? false;
    this.timestamp = options.timestamp ?? defaultTimestamp;
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
   * Return buffered events (if buffering is enabled).
   */
  drain(): JobRunnerPresenterEvent[] {
    return [...this.events];
  }

  private push(event: PresenterEventPayload): void {
    const extended: JobRunnerPresenterEvent = {
      ...event,
      runId: this.runId,
      stepId: this.stepId,
    };

    if (this.buffer) {
      this.events.push(extended);
    }

    if (this.onEvent) {
      void Promise.resolve(this.onEvent(extended)).catch(() => {
        // Swallow errors to avoid crashing the handler; host code should deal with failures.
      });
    }
  }
}

