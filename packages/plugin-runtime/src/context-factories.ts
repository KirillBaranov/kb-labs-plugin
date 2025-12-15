/**
 * @module @kb-labs/plugin-runtime/context-factories
 * Factory functions for creating ctx.api and ctx.output
 *
 * These factories create the new API groups from existing brokers and services,
 * maintaining backward compatibility while providing a cleaner API surface.
 */

import type { PluginAPI, PluginOutput } from './types';
import type { ArtifactBroker } from './artifacts/broker';
import type { InvokeBroker } from './invoke/broker';
import type { ShellBroker } from './shell/broker';
import type { JobBroker } from './jobs/broker';
import type { EventBus } from './events/index';
import type { StateRuntimeAPI } from './io/state';
import type { PresenterFacade, PresenterProgressPayload } from './presenter/presenter-facade';
import type { TelemetryEvent, TelemetryEmitResult } from '@kb-labs/core-types';

/**
 * Logger interface (compatible with existing logger)
 */
export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * Options for creating PluginAPI
 */
export interface CreatePluginAPIOptions {
  /** Invoke broker for cross-plugin invocation */
  invokeBroker?: InvokeBroker;
  /** State broker for persistent state */
  stateBroker?: StateRuntimeAPI;
  /** Artifact broker for file operations */
  artifactBroker?: ArtifactBroker;
  /** Shell broker for command execution */
  shellBroker?: ShellBroker;
  /** Event bus for pub/sub */
  eventBus?: EventBus;
  /** Job broker for background jobs */
  jobBroker?: JobBroker;
  /** Analytics emitter */
  analytics?: (event: Partial<TelemetryEvent>) => Promise<TelemetryEmitResult>;
}

/**
 * Options for creating PluginOutput
 */
export interface CreatePluginOutputOptions {
  /** Logger for structured logging */
  logger: Logger;
  /** Presenter for CLI/UI output (optional) */
  presenter?: PresenterFacade;
}

/**
 * Create ctx.api - high-level plugin capabilities
 *
 * This factory creates the PluginAPI interface from existing brokers,
 * providing a unified and clean API surface for plugin handlers.
 *
 * @param options - Brokers and services to wrap
 * @returns PluginAPI instance
 *
 * @example
 * ```typescript
 * const api = createPluginAPI({
 *   invokeBroker,
 *   stateBroker,
 *   artifactBroker,
 *   shellBroker,
 *   eventBus,
 *   jobBroker,
 *   configHelper: (section) => new SmartConfigHelper(section),
 *   analytics: emitAnalytics
 * });
 *
 * // Usage
 * await api.invoke({ pluginId: 'other', input: {} });
 * await api.state.set('key', value, 60000);
 * ```
 */
export function createPluginAPI(options: CreatePluginAPIOptions): PluginAPI {
  const {
    invokeBroker,
    stateBroker,
    artifactBroker,
    shellBroker,
    eventBus,
    jobBroker,
    analytics,
  } = options;

  return {
    // Invoke - cross-plugin invocation
    invoke: invokeBroker
      ? <T>(request: Parameters<InvokeBroker['invoke']>[0]) =>
          invokeBroker.invoke<T>(request)
      : async () => {
          throw new Error('Invoke broker not available');
        },

    // State - persistent state management
    state: stateBroker || {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
    },

    // Artifacts - file read/write
    artifacts: artifactBroker
      ? {
          read: (request) => artifactBroker.read(request),
          write: (request) => artifactBroker.write(request),
        }
      : {
          read: async () => {
            throw new Error('Artifact broker not available');
          },
          write: async () => {
            throw new Error('Artifact broker not available');
          },
        },

    // Shell - command execution
    shell: shellBroker
      ? {
          exec: (command, args, options) =>
            shellBroker.exec(command, args, options),
          spawn: (command, args, options) =>
            shellBroker.spawn(command, args, options),
        }
      : {
          exec: async () => {
            throw new Error('Shell broker not available');
          },
          spawn: async () => {
            throw new Error('Shell broker not available');
          },
        },

    // Events - pub/sub event bus
    events: eventBus
      ? {
          emit: (topic, payload, options) =>
            eventBus.emit(topic, payload, options),
          on: (topic, handler, options) => eventBus.on(topic, handler, options),
          once: (topic, handler, options) =>
            eventBus.once(topic, handler, options),
          off: (topic, handler, options) =>
            eventBus.off(topic, handler, options),
          waitFor: (topic, predicate, options) =>
            eventBus.waitFor(topic, predicate, options),
        }
      : {
          emit: async () => null,
          on: () => () => {},
          once: () => () => {},
          off: () => {},
          waitFor: async () => {
            throw new Error('Event bus not available');
          },
        },

    // Jobs - background and scheduled jobs
    jobs: jobBroker,

    // Analytics - telemetry
    analytics,
  };
}

/**
 * Create ctx.output - unified logging and presentation
 *
 * This factory combines logger and presenter into a single output API,
 * providing consistent output across CLI and REST handlers.
 *
 * @param options - Logger and optional presenter
 * @returns PluginOutput instance
 *
 * @example
 * ```typescript
 * const output = createPluginOutput({
 *   logger: runtimeLogger,
 *   presenter: ttyPresenter
 * });
 *
 * // Usage
 * output.info('Processing user data');
 * output.json({ result: data });
 * output.progress({ current: 5, total: 10 });
 * ```
 */
export function createPluginOutput(
  options: CreatePluginOutputOptions
): PluginOutput {
  const { logger, presenter } = options;

  return {
    debug: (message, meta) => {
      logger.debug(message, meta);
    },

    info: (message, meta) => {
      logger.info(message, meta);
      // Also send to presenter if available (for CLI output)
      if (presenter?.message) {
        presenter.message(message);
      }
    },

    warn: (message, meta) => {
      logger.warn(message, meta);
      // Also send to presenter if available
      if (presenter?.message) {
        presenter.message(message);
      }
    },

    error: (message, meta) => {
      logger.error(message, meta);
      // Use presenter's error method if available
      if (presenter?.error) {
        presenter.error(message);
      } else if (presenter?.message) {
        presenter.message(message);
      }
    },

    json: (data) => {
      if (presenter?.json) {
        presenter.json(data);
      } else {
        // Fallback to logger if no presenter
        logger.info('JSON output', { data });
      }
    },

    progress: (payload: PresenterProgressPayload) => {
      if (presenter?.progress) {
        presenter.progress(payload);
      } else {
        // Fallback to logger
        const { current, total, message } = payload;
        logger.info(message || 'Progress', { current, total });
      }
    },
  };
}
