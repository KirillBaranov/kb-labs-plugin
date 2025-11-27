import {
  getLogger,
  type Logger as CoreLogger,
} from '@kb-labs/core-sys';
import type { ExecutionContext } from './types.js';

type Fields = Record<string, unknown>;

export interface RuntimeLogger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields | Error): void;
  group(name: string): void;
  groupEnd(): void;
}

/**
 * Plugin logger interface (compatible with common logger patterns)
 */
export interface PluginLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown> | Error): void;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void;
}

/**
 * Create a unified logger for plugins that uses ctx.runtime.log
 * 
 * This ensures all plugins use the same logging system through runtime.log
 * instead of creating their own logger instances.
 * 
 * @param ctx - Plugin context with runtime.log
 * @param category - Optional category for fallback logger
 * @returns PluginLogger instance
 * 
 * @example
 * ```typescript
 * export async function handle(input: unknown, ctx: PluginContext) {
 *   const logger = createPluginLogger(ctx, 'my-plugin');
 *   logger.info('Plugin started');
 * }
 * ```
 */
export function createPluginLogger(
  ctx: {
    runtime?: {
      log?: (
        level: 'debug' | 'info' | 'warn' | 'error',
        msg: string,
        meta?: Record<string, unknown>
      ) => void;
    };
  },
  category?: string
): PluginLogger {
  // Prefer ctx.runtime.log if available (unified logging through runtime)
  if (ctx.runtime?.log) {
    return {
      debug(message: string, meta?: Record<string, unknown>) {
        ctx.runtime!.log!('debug', message, meta);
      },
      info(message: string, meta?: Record<string, unknown>) {
        ctx.runtime!.log!('info', message, meta);
      },
      warn(message: string, meta?: Record<string, unknown>) {
        ctx.runtime!.log!('warn', message, meta);
      },
      error(message: string, meta?: Record<string, unknown> | Error) {
        if (meta instanceof Error) {
          ctx.runtime!.log!('error', message, { error: meta.message, stack: meta.stack });
        } else {
          ctx.runtime!.log!('error', message, meta);
        }
      },
      log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
        ctx.runtime!.log!(level, message, meta);
      },
    };
  }

  // Fallback: use core logging system directly (for cases where runtime.log is not available)
  const coreLogger = getLogger(category || 'plugin');
  return {
    debug(message: string, meta?: Record<string, unknown>) {
      coreLogger.debug(message, meta);
    },
    info(message: string, meta?: Record<string, unknown>) {
      coreLogger.info(message, meta);
    },
    warn(message: string, meta?: Record<string, unknown>) {
      coreLogger.warn(message, meta);
    },
    error(message: string, meta?: Record<string, unknown> | Error) {
      coreLogger.error(message, meta);
    },
    log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
      switch (level) {
        case 'debug':
          coreLogger.debug(message, meta);
          break;
        case 'info':
          coreLogger.info(message, meta);
          break;
        case 'warn':
          coreLogger.warn(message, meta);
          break;
        case 'error':
          coreLogger.error(message, meta);
          break;
      }
    },
  };
}

export function createRuntimeLogger(
  namespace: string,
  ctx: Pick<ExecutionContext, 'requestId' | 'traceId' | 'spanId' | 'parentSpanId' | 'pluginId' | 'pluginVersion' | 'routeOrCommand'>,
  extra: Fields = {}
): RuntimeLogger {
  const coreLogger = getLogger(`runtime:${namespace}`).child({
    meta: {
      layer: 'runtime',
      reqId: ctx.requestId,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: ctx.parentSpanId,
      pluginId: ctx.pluginId,
      pluginVersion: ctx.pluginVersion,
      routeOrCommand: ctx.routeOrCommand,
      ...extra,
    },
  });

  return wrap(coreLogger);
}

function wrap(core: CoreLogger): RuntimeLogger {
  const groupStack: string[] = [];

  function enrich(fields?: Fields): Fields | undefined {
    if (!fields && groupStack.length === 0) {
      return undefined;
    }
    const merged: Fields = { ...(fields ?? {}) };
    if (groupStack.length > 0) {
      merged.group = groupStack.join('/');
    }
    return merged;
  }

  return {
    debug(message, fields) {
      core.debug(message, enrich(fields));
    },
    info(message, fields) {
      core.info(message, enrich(fields));
    },
    warn(message, fields) {
      core.warn(message, enrich(fields));
    },
    error(message, fields) {
      if (fields instanceof Error) {
        core.error(message, fields);
        return;
      }
      core.error(message, enrich(fields));
    },
    group(name) {
      groupStack.push(name);
    },
    groupEnd() {
      if (groupStack.length > 0) {
        groupStack.pop();
      }
    },
  };
}

