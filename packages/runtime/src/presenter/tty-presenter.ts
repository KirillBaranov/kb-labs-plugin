/**
 * @module @kb-labs/plugin-runtime/presenter/tty-presenter
 * Presenter implementation for interactive CLI environments.
 */

import type { Writable } from 'node:stream';
import {
  type PresenterFacade,
  type PresenterMessageOptions,
  type PresenterProgressPayload,
  type PresenterEventPayload,
} from './presenter-facade';

export interface TTYPresenterFormatter {
  (payload: PresenterEventPayload): string;
}

export interface TTYPresenterOptions {
  stdout?: Writable;
  stderr?: Writable;
  structured?: boolean;
  formatter?: TTYPresenterFormatter;
  timestamp?: () => string;
}

function defaultTimestamp(): string {
  return new Date().toISOString();
}

function defaultFormatter(payload: PresenterEventPayload): string {
  return JSON.stringify(payload);
}

export class TTYPresenter implements PresenterFacade {
  private readonly stdout: Writable;
  private readonly stderr: Writable;
  private readonly structured: boolean;
  private readonly formatter: TTYPresenterFormatter;
  private readonly timestamp: () => string;

  constructor(options: TTYPresenterOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
    this.structured = options.structured ?? true;
    this.formatter = options.formatter ?? defaultFormatter;
    this.timestamp = options.timestamp ?? defaultTimestamp;
  }

  message(text: string, options?: PresenterMessageOptions): void {
    this.write(this.stdout, {
      type: 'message',
      text,
      options,
      timestamp: this.timestamp(),
    });
  }

  progress(update: PresenterProgressPayload): void {
    this.write(this.stdout, {
      type: 'progress',
      update,
      timestamp: this.timestamp(),
    });
  }

  json(data: unknown): void {
    this.write(this.stdout, {
      type: 'json',
      data,
      timestamp: this.timestamp(),
    });
  }

  error(error: unknown, meta?: Record<string, unknown>): void {
    this.write(this.stderr, {
      type: 'error',
      error: serializeError(error),
      meta,
      timestamp: this.timestamp(),
    });
  }

  private write(stream: Writable, payload: PresenterEventPayload): void {
    if (this.structured) {
      stream.write(this.formatter(payload) + '\n');
      return;
    }

    switch (payload.type) {
      case 'message': {
        const level = payload.options?.level ?? 'info';
        stream.write(`[${level.toUpperCase()}] ${payload.text}\n`);
        break;
      }
      case 'progress': {
        const { stage, status, percent, message } = payload.update;
        const statusText = status ? ` (${status})` : '';
        const pctText = typeof percent === 'number' ? ` ${percent}%` : '';
        const msgText = message ? ` - ${message}` : '';
        stream.write(`[PROGRESS] ${stage}${statusText}${pctText}${msgText}\n`);
        break;
      }
      case 'json': {
        stream.write(`${JSON.stringify(payload.data, null, 2)}\n`);
        break;
      }
      case 'error': {
        const err = payload.error;
        if (typeof err === 'string') {
          stream.write(`[ERROR] ${err}\n`);
        } else if (err && typeof err === 'object' && 'stack' in err) {
          stream.write(`${String((err as { stack: string }).stack)}\n`);
        } else {
          stream.write(`[ERROR] ${JSON.stringify(err)}\n`);
        }
        break;
      }
    }
  }
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  if (typeof error === 'string') {
    return { message: error };
  }

  if (error && typeof error === 'object') {
    return { ...error } as Record<string, unknown>;
  }

  return { message: String(error) };
}


