/**
 * @module @kb-labs/plugin-runtime/sandbox/child/runtime
 * Build safe runtime context for handlers
 */

import type { PermissionSpec, ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext, FSLike } from '../../types.js';
import type { InvokeBroker } from '../../invoke/broker.js';
import type { ArtifactBroker } from '../../artifacts/broker.js';
import type { StateBroker } from '@kb-labs/state-broker';
import { createWhitelistedFetch } from '../../io/net.js';
import { createFsShim } from '../../io/fs.js';
import { createEnvAccessor } from '../../io/env.js';
import { createStateAPI, type StateRuntimeAPI } from '../../io/state.js';
import { SmartConfigHelper } from '../../config/config-helper.js';
import type {
  EmitOptions,
  EventBusConfig,
  EventEnvelope,
  EventScope,
  SubscriptionOptions,
  WaitForOptions,
  EventHandler,
  EventBus,
} from '../../events/index.js';

type RuntimeEventsApi = {
  emit<T = unknown>(topic: string, payload: T, options?: EmitOptions): Promise<EventEnvelope<T> | null>;
  on<T = unknown>(
    topic: string,
    handler: (event: EventEnvelope<T>) => void | Promise<void>,
    options?: SubscriptionOptions
  ): () => void;
  once<T = unknown>(
    topic: string,
    handler: (event: EventEnvelope<T>) => void | Promise<void>,
    options?: SubscriptionOptions
  ): () => void;
  off(topic: string, handler?: (event: EventEnvelope) => void | Promise<void>, options?: SubscriptionOptions): void;
  waitFor<T = unknown>(
    topic: string,
    predicate?: (event: EventEnvelope<T>) => boolean,
    options?: WaitForOptions<T>
  ): Promise<EventEnvelope<T>>;
};

type SubscriptionHandler<T = any> = (event: EventEnvelope<T>) => void | Promise<void>;

type IpcPending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
};

const ipcBridgeState: {
  initialized: boolean;
  pending: Map<string, IpcPending>;
  subscriptions: Map<string, { topic: string; scope: EventScope; handler: SubscriptionHandler<any>; once?: boolean }>;
  requestSeq: number;
  config?: EventBusConfig;
  hasLocal?: boolean;
  hasPlugin?: boolean;
} = {
  initialized: false,
  pending: new Map(),
  subscriptions: new Map(),
  requestSeq: 0,
  config: undefined,
  hasLocal: undefined,
  hasPlugin: undefined,
};

function ensureScope(meta: { hasLocal?: boolean; hasPlugin?: boolean }, scope: EventScope): void {
  if (scope === 'local' && meta.hasLocal === false) {
    throw new Error('EventBus local scope not available in sandbox runtime');
  }
  if (scope === 'plugin' && meta.hasPlugin !== true) {
    throw new Error('EventBus plugin scope not enabled for this execution');
  }
}

function sanitiseEmitOptions(options?: EmitOptions): EmitOptions | undefined {
  if (!options) return undefined;
  const { signal, ...rest } = options;
  return rest;
}

function createDirectRuntimeEvents(
  services: { local?: any; plugin?: any }
): RuntimeEventsApi | undefined {
  const localBus = services.local as EventBus | undefined;
  const pluginBus = services.plugin as EventBus | undefined;

  const resolveBus = (scope: EventScope): EventBus => {
    if (scope === 'plugin') {
      if (!pluginBus) {
        throw new Error('Plugin scope EventBus not available');
      }
      return pluginBus;
    }
    if (!localBus) {
      throw new Error('Local EventBus not available');
    }
    return localBus;
  };

  const api: RuntimeEventsApi = {
    async emit<T = unknown>(topic: string, payload: T, options?: EmitOptions) {
      const scope = options?.scope ?? 'local';
      const bus = resolveBus(scope);
      return bus.emit<T>(topic, payload, options);
    },
    on<T = unknown>(topic: string, handler: EventHandler<T>, options?: SubscriptionOptions) {
      const scope = options?.scope ?? 'local';
      const bus = resolveBus(scope);
      return bus.on<T>(topic, handler, options);
    },
    once<T = unknown>(topic: string, handler: EventHandler<T>, options?: SubscriptionOptions) {
      const scope = options?.scope ?? 'local';
      const bus = resolveBus(scope);
      return bus.once<T>(topic, handler, options);
    },
    off<T = unknown>(topic: string, handler?: EventHandler<T>, options?: SubscriptionOptions) {
      const scope = options?.scope ?? 'local';
      const bus = resolveBus(scope);
      bus.off<T>(topic, handler, options);
    },
    waitFor<T = unknown>(
      topic: string,
      predicate?: (event: EventEnvelope<T>) => boolean,
      options?: WaitForOptions<T>
    ) {
      const scope = options?.scope ?? 'local';
      const bus = resolveBus(scope);
      return bus.waitFor<T>(topic, predicate, options);
    },
  };

  return api;
}

function initIpcBridge(): void {
  if (ipcBridgeState.initialized || typeof process.send !== 'function') {
    return;
  }

  process.on('message', (msg: any) => {
    if (!msg || typeof msg !== 'object') {
      return;
    }
    if (msg.type === 'EVENT_EMIT_RESULT') {
      const opId = msg.payload?.opId;
      const pending = opId ? ipcBridgeState.pending.get(opId) : undefined;
      if (!pending) return;
      ipcBridgeState.pending.delete(opId);
      if (msg.payload?.ok) {
        pending.resolve(msg.payload.envelope ?? null);
      } else {
        const error = new Error(msg.payload?.error?.message || 'Event emit failed');
        (error as any).code = msg.payload?.error?.code;
        pending.reject(error);
      }
      return;
    }
    if (msg.type === 'EVENT_SUBSCRIBE_ACK' || msg.type === 'EVENT_UNSUBSCRIBE_ACK') {
      const opId = msg.payload?.opId;
      const pending = opId ? ipcBridgeState.pending.get(opId) : undefined;
      if (!pending) return;
      ipcBridgeState.pending.delete(opId);
      if (msg.payload?.ok) {
        pending.resolve(true);
      } else {
        const error = new Error(msg.payload?.error?.message || 'Event subscription failed');
        (error as any).code = msg.payload?.error?.code;
        pending.reject(error);
      }
      return;
    }
    if (msg.type === 'EVENT_DISPATCH') {
      const { subscriptionId, envelope } = msg.payload ?? {};
      if (!subscriptionId || !ipcBridgeState.subscriptions.has(subscriptionId)) {
        return;
      }
      const entry = ipcBridgeState.subscriptions.get(subscriptionId)!;
      Promise.resolve(entry.handler(envelope))
        .catch(err => {
          console.error('[runtime.events] handler error:', err);
        })
        .finally(() => {
          if (entry.once) {
            ipcBridgeState.subscriptions.delete(subscriptionId);
          }
        });
      return;
    }
  });

  ipcBridgeState.initialized = true;
}

function sendIpcRequest<T = unknown>(type: string, payload: Record<string, unknown>): Promise<T> {
  if (typeof process.send !== 'function') {
    return Promise.reject(new Error('IPC bridge unavailable'));
  }
  const opId = `${Date.now()}-${++ipcBridgeState.requestSeq}`;
  return new Promise<T>((resolve, reject) => {
    ipcBridgeState.pending.set(opId, { resolve, reject });
    process.send!({
      type,
      payload: {
        ...payload,
        opId,
      },
    });
  });
}

function createIpcRuntimeEvents(
  meta: { config?: EventBusConfig; hasLocal?: boolean; hasPlugin?: boolean }
): RuntimeEventsApi | undefined {
  if (typeof process.send !== 'function' || !meta.config) {
    return undefined;
  }

  ipcBridgeState.config = meta.config;
  ipcBridgeState.hasLocal = meta.hasLocal;
  ipcBridgeState.hasPlugin = meta.hasPlugin;
  initIpcBridge();

  const resolveScope = (scope: EventScope | undefined): EventScope => scope ?? 'local';

  const api: RuntimeEventsApi = {
    async emit<T = unknown>(topic: string, payload: T, options?: EmitOptions) {
      const scope = resolveScope(options?.scope);
      ensureScope({ hasLocal: ipcBridgeState.hasLocal, hasPlugin: ipcBridgeState.hasPlugin }, scope);
      const result = await sendIpcRequest<{ envelope?: EventEnvelope | null }>('EVENT_EMIT', {
        topic,
        scope,
        payload,
        options: sanitiseEmitOptions(options),
      });
      return (((result as any)?.envelope ?? null) as EventEnvelope<T> | null);
    },
    on<T = unknown>(
      topic: string,
      handler: (event: EventEnvelope<T>) => void | Promise<void>,
      options?: SubscriptionOptions
    ) {
      const scope = resolveScope(options?.scope);
      ensureScope({ hasLocal: ipcBridgeState.hasLocal, hasPlugin: ipcBridgeState.hasPlugin }, scope);
      const subscriptionId = `${scope}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      ipcBridgeState.subscriptions.set(subscriptionId, {
        topic,
        scope,
        handler: handler as SubscriptionHandler<any>,
        once: false,
      });
      sendIpcRequest('EVENT_SUBSCRIBE', {
        subscriptionId,
        topic,
        scope,
        once: false,
      }).catch(error => {
        ipcBridgeState.subscriptions.delete(subscriptionId);
        console.error('[runtime.events] subscribe failed:', error);
      });
      return () => {
        if (!ipcBridgeState.subscriptions.has(subscriptionId)) {
          return;
        }
        ipcBridgeState.subscriptions.delete(subscriptionId);
        sendIpcRequest('EVENT_UNSUBSCRIBE', { subscriptionId }).catch(() => {});
      };
    },
    once<T = unknown>(
      topic: string,
      handler: (event: EventEnvelope<T>) => void | Promise<void>,
      options?: SubscriptionOptions
    ) {
      const scope = resolveScope(options?.scope);
      ensureScope({ hasLocal: ipcBridgeState.hasLocal, hasPlugin: ipcBridgeState.hasPlugin }, scope);
      const subscriptionId = `${scope}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      const wrapped: SubscriptionHandler = async event => {
        await handler(event as EventEnvelope<T>);
        ipcBridgeState.subscriptions.delete(subscriptionId);
      };
      ipcBridgeState.subscriptions.set(subscriptionId, {
        topic,
        scope,
        handler: wrapped,
        once: true,
      });
      sendIpcRequest('EVENT_SUBSCRIBE', {
        subscriptionId,
        topic,
        scope,
        once: true,
      }).catch(error => {
        ipcBridgeState.subscriptions.delete(subscriptionId);
        console.error('[runtime.events] subscribe once failed:', error);
      });
      return () => {
        if (!ipcBridgeState.subscriptions.has(subscriptionId)) {
          return;
        }
        ipcBridgeState.subscriptions.delete(subscriptionId);
        sendIpcRequest('EVENT_UNSUBSCRIBE', { subscriptionId }).catch(() => {});
      };
    },
    off<T = unknown>(
      topic: string,
      handler?: (event: EventEnvelope<T>) => void | Promise<void>,
      options?: SubscriptionOptions
    ) {
      const scope = resolveScope(options?.scope);
      for (const [id, entry] of ipcBridgeState.subscriptions.entries()) {
        if (entry.topic === topic && entry.scope === scope && (!handler || entry.handler === handler)) {
          ipcBridgeState.subscriptions.delete(id);
          sendIpcRequest('EVENT_UNSUBSCRIBE', { subscriptionId: id }).catch(() => {});
        }
      }
    },
    waitFor<T = unknown>(
      topic: string,
      predicate?: (event: EventEnvelope<T>) => boolean,
      options?: WaitForOptions<T>
    ) {
      const scope = resolveScope(options?.scope);
      ensureScope({ hasLocal: ipcBridgeState.hasLocal, hasPlugin: ipcBridgeState.hasPlugin }, scope);
      const timeoutMs = options?.timeoutMs ?? meta.config!.defaultWaitTimeoutMs;
      return new Promise<EventEnvelope<T>>((resolve, reject) => {
        const subscriptionId = `${scope}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        const cleanup = () => {
          ipcBridgeState.subscriptions.delete(subscriptionId);
          sendIpcRequest('EVENT_UNSUBSCRIBE', { subscriptionId }).catch(() => {});
        };
        const onAbort = () => {
          cleanup();
          reject(new Error('E_EVENT_ABORTED'));
        };
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error('E_EVENT_TIMEOUT'));
        }, timeoutMs);
        if (options?.signal) {
          if (options.signal.aborted) {
            clearTimeout(timer);
            return reject(new Error('E_EVENT_ABORTED'));
          }
          options.signal.addEventListener('abort', () => {
            clearTimeout(timer);
            onAbort();
          }, { once: true });
        }
        const wrapped: SubscriptionHandler = event => {
          if (predicate && !predicate(event)) {
            return;
          }
          clearTimeout(timer);
          cleanup();
          resolve(event as EventEnvelope<T>);
        };
        ipcBridgeState.subscriptions.set(subscriptionId, {
          topic,
          scope,
          handler: wrapped,
          once: true,
        });
        sendIpcRequest('EVENT_SUBSCRIBE', {
          subscriptionId,
          topic,
          scope,
          once: true,
        }).catch(error => {
          clearTimeout(timer);
          ipcBridgeState.subscriptions.delete(subscriptionId);
          reject(error);
        });
      }) as Promise<EventEnvelope<T>>;
    },
  };

  return api;
}

function createRuntimeEvents(ctx: ExecutionContext): RuntimeEventsApi | undefined {
  const eventsExt: any = (ctx.extensions as any)?.events;
  if (!eventsExt) {
    return undefined;
  }

  // Direct mode (in-process runner)
  if (eventsExt.local || eventsExt.plugin) {
    return createDirectRuntimeEvents({
      local: eventsExt.local,
      plugin: eventsExt.plugin,
    });
  }

  // IPC mode
  if (typeof process.send === 'function') {
    return createIpcRuntimeEvents({
      config: eventsExt.config,
      hasLocal: eventsExt.hasLocal ?? true,
      hasPlugin: eventsExt.hasPlugin ?? false,
    });
  }

  return undefined;
}

/**
 * Build safe runtime context for handler execution
 * @param perms - Resolved permissions
 * @param ctx - Execution context
 * @param env - Filtered environment (already whitelisted)
 * @param manifest - Plugin manifest
 * @param invokeBroker - Invoke broker for cross-plugin calls
 * @param artifactBroker - Artifact broker for artifact access
 * @returns Runtime context with shimmed APIs
 */
export function buildRuntime(
  perms: PermissionSpec,
  ctx: ExecutionContext,
  env: NodeJS.ProcessEnv,
  manifest: ManifestV2,
  invokeBroker?: InvokeBroker,
  artifactBroker?: ArtifactBroker,
  shellBroker?: import('../../shell/broker.js').ShellBroker,
  stateBroker?: StateBroker
): {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  fs: FSLike;
  env: (key: string) => string | undefined;
  logger: {
    debug: (msg: string, meta?: Record<string, unknown>) => void;
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, meta?: Record<string, unknown>) => void;
  };
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ) => void;
  invoke: <T = unknown>(
    request: import('../../invoke/types.js').InvokeRequest
  ) => Promise<import('../../invoke/types.js').InvokeResult<T>>;
  artifacts: {
    read: (
      request: import('../../artifacts/broker.js').ArtifactReadRequest
    ) => Promise<Buffer | object>;
    write: (
      request: import('../../artifacts/broker.js').ArtifactWriteRequest
    ) => Promise<{
      path: string;
      meta: import('../../artifacts/broker.js').ArtifactMeta;
    }>;
  };
  shell: {
    exec: (
      command: string,
      args: string[],
      options?: import('../../shell/types.js').ShellExecOptions
    ) => Promise<import('../../shell/types.js').ShellResult>;
    spawn: (
      command: string,
      args: string[],
      options?: import('../../shell/types.js').ShellSpawnOptions
    ) => Promise<import('../../shell/types.js').ShellSpawnResult>;
  };
  analytics?: (event: Partial<import('@kb-labs/core-types').TelemetryEvent>) => Promise<import('@kb-labs/core-types').TelemetryEmitResult>;
  events?: RuntimeEventsApi;
  config: {
    ensureSection: (
      pointer: string,
      value: unknown,
      options?: import('../../config/config-helper.js').EnsureSectionOptions
    ) => Promise<import('../../config/config-helper.js').EnsureSectionResult>;
  };
  state?: StateRuntimeAPI;
} {
  // Build network fetch (with whitelisting and dry-run support)
  const fetch = createWhitelistedFetch(perms.net, globalThis.fetch, ctx);

  // Build FS shim (with permission checks)
  const fs = createFsShim(perms.fs, ctx.workdir, ctx.outdir, ctx);

  const configHelper = new SmartConfigHelper({
    workdir: ctx.workdir,
    fs,
    tracker: ctx.operationTracker,
    defaultConfigPath: '.kb/kb-labs.config.json'
  });

  // Build env accessor
  const envAccessor = createEnvAccessor(perms.env?.allow, env);

  // Build log function (sends via IPC and uses new logging system)
  // For subprocess: send via IPC to parent
  // Also use new logging system for unified logging
  const log = (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ): void => {
    // Send via IPC for subprocess communication (legacy)
    if (process.send) {
      process.send({
        type: 'LOG',
        payload: {
          level,
          message: msg,
          meta,
          timestamp: Date.now(),
        },
      });
    }

    // Also use new unified logging system
    // Dynamic import to avoid circular dependencies
    try {
      const { getLogger } = require('@kb-labs/core-sys/logging');
      const logger = getLogger(`runtime:plugin:${ctx.pluginId || 'unknown'}`).child({
        meta: {
          layer: 'runtime',
          reqId: ctx.requestId,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          pluginId: ctx.pluginId,
          ...meta,
        },
      });

      switch (level) {
        case 'debug':
          logger.debug(msg, meta);
          break;
        case 'info':
          logger.info(msg, meta);
          break;
        case 'warn':
          logger.warn(msg, meta);
          break;
        case 'error':
          logger.error(msg, meta);
          break;
      }
    } catch {
      // If new logging system not available, fallback to IPC only
    }
  };

  // Build invoke function
  const invoke = async <T = unknown>(
    request: import('../../invoke/types.js').InvokeRequest
  ): Promise<import('../../invoke/types.js').InvokeResult<T>> => {
    if (!invokeBroker) {
      throw new Error('Invoke broker not available in this context');
    }
    const result = await invokeBroker.invoke(request);
    return result as import('../../invoke/types.js').InvokeResult<T>;
  };

  // Build artifacts API
  const artifacts = {
    read: async (
      request: import('../../artifacts/broker.js').ArtifactReadRequest
    ): Promise<Buffer | object> => {
      if (!artifactBroker) {
        throw new Error('Artifact broker not available in this context');
      }
      return artifactBroker.read(request);
    },
    write: async (
      request: import('../../artifacts/broker.js').ArtifactWriteRequest
    ): Promise<{
      path: string;
      meta: import('../../artifacts/broker.js').ArtifactMeta;
    }> => {
      if (!artifactBroker) {
        throw new Error('Artifact broker not available in this context');
      }
      return artifactBroker.write(request);
    },
  };

  // Build shell API
  const shell = {
    exec: async (
      command: string,
      args: string[],
      options?: import('../../shell/types.js').ShellExecOptions
    ): Promise<import('../../shell/types.js').ShellResult> => {
      if (!shellBroker) {
        throw new Error('Shell broker not available in this context');
      }
      return shellBroker.exec(command, args, options);
    },
    spawn: async (
      command: string,
      args: string[],
      options?: import('../../shell/types.js').ShellSpawnOptions
    ): Promise<import('../../shell/types.js').ShellSpawnResult> => {
      if (!shellBroker) {
        throw new Error('Shell broker not available in this context');
      }
      return shellBroker.spawn(command, args, options);
    },
  };

  // Build analytics emitter (if available in context)
  const analytics = ctx.analytics
    ? async (
        event: Partial<import('@kb-labs/core-types').TelemetryEvent>,
      ) => ctx.analytics!(event)
    : undefined;

  const events = createRuntimeEvents(ctx);

  // Build state API (if broker available and permissions granted)
  const state = stateBroker && perms.state
    ? createStateAPI(stateBroker, ctx.pluginId, perms.state)
    : undefined;

  // Create unified logger interface (wraps the log function)
  const logger = {
    debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
  };

  return {
    fetch,
    fs,
    env: envAccessor,
    logger,  // ✅ NEW unified API
    log,     // ⚠️ DEPRECATED but still works
    invoke,
    artifacts,
    shell,
    analytics,
    events,
    config: {
      ensureSection: configHelper.ensureSection.bind(configHelper)
    },
    state,
  };
}
