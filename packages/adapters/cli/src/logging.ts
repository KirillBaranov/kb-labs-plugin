import {
  configureLogger,
  getLogger,
  setLogLevel,
  addSink,
  removeSink,
  createConsoleSink,
  type LogLevel,
  type Logger as CoreLogger,
} from '@kb-labs/core-sys/logging';

type Fields = Record<string, unknown>;

interface CliLogger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields | Error): void;
  group(name: string): void;
  groupEnd(): void;
}

let configured = false;
let consoleSink: ReturnType<typeof createConsoleSink> | null = null;

export function initCliLogging(level: LogLevel = 'info'): void {
  // This function is deprecated - logging should be initialized via initLogging() from @kb-labs/core-sys/logging
  // We keep it for backward compatibility but it should not override existing configuration
  // Just update the log level if needed, but don't replace sinks
  setLogLevel(level);
  configured = true; // Mark as configured to prevent further initialization attempts
}

export function createCliLogger(
  scope: string,
  context: Fields
): CliLogger {
  const coreLogger = getLogger(`cli:${scope}`).child({
    meta: {
      layer: 'cli',
      ...context,
    },
  });

  return wrap(coreLogger);
}

function wrap(core: CoreLogger): CliLogger {
  const groupStack: string[] = [];

  function includeGroup(fields?: Fields): Fields | undefined {
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
      core.debug(message, includeGroup(fields));
    },
    info(message, fields) {
      core.info(message, includeGroup(fields));
    },
    warn(message, fields) {
      core.warn(message, includeGroup(fields));
    },
    error(message, fields) {
      if (fields instanceof Error) {
        core.error(message, fields);
        return;
      }
      core.error(message, includeGroup(fields));
    },
    group(name: string) {
      groupStack.push(name);
    },
    groupEnd() {
      if (groupStack.length > 0) {
        groupStack.pop();
      }
    },
  };
}

