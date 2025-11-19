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

