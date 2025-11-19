/**
 * @module @kb-labs/plugin-runtime/events/event-bus
 * In-memory scoped EventBus with quotas and observability hooks.
 */

import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createId } from '../utils.js';
import type {
  DropPolicy,
  EmitOptions,
  EventBus,
  EventBusError,
  EventBusInit,
  EventEnvelope,
  EventHandler,
  EventScope,
  SubscriptionOptions,
  WaitForOptions,
} from './types.js';
import { EventBusError as BusError } from './types.js';

type HandlerEntry = {
  handler: EventHandler<unknown>;
  remaining: number;
  once: boolean;
  signal?: AbortSignal;
};

type QueuedEvent = {
  topic: string;
  scope: EventScope;
  envelope: EventEnvelope<unknown>;
  options?: EmitOptions;
};

type ScopeState = {
  listeners: Map<string, Set<HandlerEntry>>;
  queue: QueuedEvent[];
  activeHandlers: number;
  emittedTimestamps: number[];
  duplicateCache: Map<string, number>;
  waiters: Map<string, Set<(event: EventEnvelope<unknown>) => void>>;
};

const DEFAULT_REDACT_KEYS = ['authorization', 'apiKey', 'token', 'password', 'secret'];

const EVENT_EMIT = 'plugin.events.emit';
const EVENT_RECEIVED = 'plugin.events.received';
const EVENT_DENIED = 'plugin.events.denied';
const EVENT_DROPPED = 'plugin.events.dropped';

export class ScopedEventBus implements EventBus {
  readonly config: EventBusInit['config'];
  private readonly hooks: Required<EventBusInit>['hooks'];
  private readonly permissions?: EventBusInit['permissions'];
  private readonly contextMeta?: EventBusInit['contextMeta'];
  private readonly scopeState: Record<EventScope, ScopeState>;
  private readonly dropPolicy: DropPolicy;
  private draining = false;

  constructor(init: EventBusInit) {
    this.config = init.config;
    this.hooks = {
      analytics: async () => {},
      logger: () => {},
      enforcePermissions: undefined,
      onSystemEvent: () => {},
      ...init.hooks,
    };
    this.permissions = init.permissions;
    this.contextMeta = init.contextMeta;
    this.dropPolicy = init.config.dropPolicy;

    const newScopeState = (): ScopeState => ({
      listeners: new Map(),
      queue: [],
      activeHandlers: 0,
      emittedTimestamps: [],
      duplicateCache: new Map(),
      waiters: new Map(),
    });

    this.scopeState = {
      local: newScopeState(),
      plugin: newScopeState(),
    };
  }

  async emit<T = unknown>(topic: string, payload: T, options: EmitOptions = {}): Promise<EventEnvelope<T> | null> {
    const scope = options.scope ?? 'local';
    await this.guard('produce', topic, scope);
    const state = this.scopeState[scope];

    const payloadBytes = this.estimateSize(payload);
    if (payloadBytes > this.config.maxPayloadBytes) {
      throw new BusError('E_EVENT_PAYLOAD_TOO_LARGE', `Event payload exceeds ${this.config.maxPayloadBytes} bytes`, {
        topic,
        scope,
        size: payloadBytes,
        max: this.config.maxPayloadBytes,
      });
    }

    this.enforceRateLimit(state, topic, scope);

    const meta = this.buildMeta(topic, options);
    const envelope: EventEnvelope<T> = {
      eventId: createId(),
      idempotencyKey: options.idempotencyKey,
      topic,
      scope,
      ts: Date.now(),
      payload,
      meta,
    };

    if (this.isDuplicate(state, envelope)) {
      await this.emitAnalytics(EVENT_DROPPED, {
        topic,
        scope,
        reason: 'duplicate',
        idempotencyKey: envelope.idempotencyKey,
      });
      this.log('debug', 'Duplicate event ignored', { topic, scope, idempotencyKey: envelope.idempotencyKey });
      return null;
    }

    if (options.signal?.aborted) {
      throw new BusError('E_EVENT_ABORTED', 'Event emission aborted', { topic, scope });
    }

    this.enqueue(state, envelope, options);
    this.processQueue(scope).catch(error => {
      this.log('error', 'Failed to process event queue', { topic, scope, error: error instanceof Error ? error.message : String(error) });
    });

    await this.emitAnalytics(EVENT_EMIT, {
      topic,
      scope,
      size: payloadBytes,
      requestId: meta.requestId,
      traceId: meta.traceId,
      emitter: meta.emitter,
    });

    return envelope;
  }

  on<T = unknown>(topic: string, handler: EventHandler<T>, options: SubscriptionOptions = {}): () => void {
    return this.subscribe(topic, handler, options, false);
  }

  once<T = unknown>(topic: string, handler: EventHandler<T>, options: SubscriptionOptions = {}): () => void {
    return this.subscribe(topic, handler, options, true);
  }

  off<T = unknown>(topic: string, handler?: EventHandler<T>, options: SubscriptionOptions = {}): void {
    const scope = options.scope ?? 'local';
    const state = this.scopeState[scope];
    const listeners = state.listeners.get(topic);
    if (!listeners || listeners.size === 0) {
      return;
    }

    if (!handler) {
      listeners.clear();
    } else {
      for (const entry of listeners) {
        if (entry.handler === handler) {
          listeners.delete(entry);
        }
      }
    }
  }

  async waitFor<T = unknown>(topic: string, predicate?: (event: EventEnvelope<T>) => boolean, options: WaitForOptions<T> = {}): Promise<EventEnvelope<T>> {
    const scope = options.scope ?? 'local';
    await this.guard('consume', topic, scope);
    const state = this.scopeState[scope];

    const timeoutMs = options.timeoutMs ?? this.config.defaultWaitTimeoutMs;
    if (timeoutMs <= 0) {
      throw new BusError('E_EVENT_TIMEOUT', 'waitFor timeout must be greater than 0');
    }

    return new Promise<EventEnvelope<T>>((resolve, reject) => {
      const controller = new AbortController();
      const signal = options.signal;

      const onAbort = () => {
        cleanup();
        reject(new BusError('E_EVENT_ABORTED', 'waitFor aborted', { topic, scope }));
      };

      const onTimeout = () => {
        cleanup();
        reject(new BusError('E_EVENT_TIMEOUT', `Timed out waiting for event ${topic}`, { topic, scope, timeoutMs }));
      };

      const timeout = setTimeout(onTimeout, timeoutMs);

      const cleanup = () => {
        clearTimeout(timeout);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        controller.abort();
        const waiters = state.waiters.get(topic);
        if (waiters) {
          waiters.delete(matchAndResolve as (event: EventEnvelope<unknown>) => void);
          if (waiters.size === 0) {
            state.waiters.delete(topic);
          }
        }
      };

      const matchAndResolve = (event: EventEnvelope<T>) => {
        if (controller.signal.aborted) {
          return;
        }
        if (predicate && !predicate(event)) {
          return;
        }
        cleanup();
        resolve(event);
      };

      if (signal) {
        if (signal.aborted) {
          return onAbort();
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      if (!state.waiters.has(topic)) {
        state.waiters.set(topic, new Set());
      }
      state.waiters.get(topic)!.add(matchAndResolve as (event: EventEnvelope<unknown>) => void);
    });
  }

  async shutdown(options?: { timeoutMs?: number }): Promise<void> {
    const timeoutMs = options?.timeoutMs ?? this.config.shutdownTimeoutMs;
    this.draining = true;

    const scopes: EventScope[] = ['local', 'plugin'];
    const deadline = Date.now() + timeoutMs;

    for (const scope of scopes) {
      const state = this.scopeState[scope];
      while ((state.queue.length > 0 || state.activeHandlers > 0) && Date.now() < deadline) {
        await delay(10);
      }
      state.listeners.clear();
      state.queue.length = 0;
      state.waiters.clear();
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private subscribe<T = unknown>(topic: string, handler: EventHandler<T>, options: SubscriptionOptions, once: boolean): () => void {
    const scope = options.scope ?? 'local';
    const state = this.scopeState[scope];
    const listeners = state.listeners.get(topic) ?? new Set<HandlerEntry>();

    if (listeners.size >= this.config.maxListenersPerTopic) {
      throw new BusError('E_EVENT_LISTENER_LIMIT', `Max listeners exceeded for topic ${topic}`, {
        topic,
        scope,
        max: this.config.maxListenersPerTopic,
      });
    }

    const entry: HandlerEntry = {
      handler: handler as EventHandler<unknown>,
      remaining: options.maxInvocations ?? Number.POSITIVE_INFINITY,
      once,
      signal: options.signal,
    };

    listeners.add(entry);
    if (!state.listeners.has(topic)) {
      state.listeners.set(topic, listeners);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        listeners.delete(entry);
      } else {
        const abort = () => {
          this.off(topic, handler, options);
        };
        options.signal.addEventListener('abort', abort, { once: true });
      }
    }

    return () => this.off(topic, handler, options);
  }

  private enqueue(state: ScopeState, envelope: EventEnvelope, options: EmitOptions): void {
    if (state.queue.length >= this.config.maxQueueSize) {
      const reason = 'queue_saturated';
      let dropped: QueuedEvent | undefined;

      if (this.dropPolicy === 'drop-oldest') {
        dropped = state.queue.shift();
        state.queue.push({ topic: envelope.topic, scope: envelope.scope, envelope, options });
      } else {
        dropped = { topic: envelope.topic, scope: envelope.scope, envelope, options };
      }

      if (dropped) {
        this.emitAnalytics(EVENT_DROPPED, {
          topic: dropped.topic,
          scope: dropped.scope,
          reason,
        }).catch(() => {});
        this.log('warn', 'Event dropped due to saturated queue', {
          topic: dropped.topic,
          scope: dropped.scope,
          policy: this.dropPolicy,
        });
      }
    } else {
      state.queue.push({ topic: envelope.topic, scope: envelope.scope, envelope, options });
    }
  }

  private async processQueue(scope: EventScope): Promise<void> {
    const state = this.scopeState[scope];
    if (state.activeHandlers >= this.config.concurrentHandlers) {
      return;
    }

    while (!this.draining && state.queue.length > 0 && state.activeHandlers < this.config.concurrentHandlers) {
      const queued = state.queue.shift();
      if (!queued) break;

      const listeners = state.listeners.get(queued.topic);
      const waiters = state.waiters.get(queued.topic);

      if (!listeners || listeners.size === 0) {
        if (waiters && waiters.size > 0) {
          for (const waiter of waiters) {
            waiter(queued.envelope);
          }
          state.waiters.delete(queued.topic);
        }
        continue;
      }

      state.activeHandlers += listeners.size;

      await Promise.allSettled(
        Array.from(listeners).map(async listener => {
          if (listener.signal?.aborted) {
            listeners.delete(listener);
            state.activeHandlers -= 1;
            return;
          }

          try {
            await listener.handler(queued.envelope);
            await this.emitAnalytics(EVENT_RECEIVED, {
              topic: queued.topic,
              scope,
              listenerCount: listeners.size,
            });
          } catch (error) {
            this.log('error', 'Event handler failed', {
              topic: queued.topic,
              scope,
              error: error instanceof Error ? error.message : String(error),
            });
            await this.emitAnalytics(EVENT_DROPPED, {
              topic: queued.topic,
              scope,
              reason: 'handler_error',
            });
          } finally {
            listener.remaining -= 1;
            if (listener.once || listener.remaining <= 0) {
              listeners.delete(listener);
            }
            state.activeHandlers -= 1;
          }
        }),
      );

      if (waiters && waiters.size > 0) {
        for (const waiter of waiters) {
          waiter(queued.envelope);
        }
        state.waiters.delete(queued.topic);
      }
    }
  }

  private enforceRateLimit(state: ScopeState, topic: string, scope: EventScope): void {
    const now = Date.now();
    const windowStart = now - 60_000;
    state.emittedTimestamps = state.emittedTimestamps.filter(ts => ts >= windowStart);
    if (state.emittedTimestamps.length >= this.config.eventsPerMinute) {
      throw new BusError('E_PLUGIN_EVENT_QUOTA', 'Event emission rate limit exceeded', {
        topic,
        scope,
        maxPerMinute: this.config.eventsPerMinute,
      });
    }
    state.emittedTimestamps.push(now);
  }

  private isDuplicate(state: ScopeState, envelope: EventEnvelope): boolean {
    const key = envelope.idempotencyKey ?? this.computePayloadHash(envelope);
    if (!key) {
      return false;
    }

    const now = Date.now();
    const existing = state.duplicateCache.get(key);
    if (existing && now - existing < this.config.duplicateTtlMs) {
      return true;
    }

    state.duplicateCache.set(key, now);
    if (state.duplicateCache.size > this.config.duplicateCacheSize) {
      const oldestKey = [...state.duplicateCache.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
      if (oldestKey) {
        state.duplicateCache.delete(oldestKey);
      }
    }

    return false;
  }

  private computePayloadHash(envelope: EventEnvelope): string | undefined {
    try {
      const hash = createHash('sha256');
      hash.update(envelope.topic);
      hash.update(String(envelope.scope));
      hash.update(JSON.stringify(envelope.payload));
      if (envelope.meta.traceId) {
        hash.update(envelope.meta.traceId);
      }
      return hash.digest('hex');
    } catch (error) {
      this.log('warn', 'Failed to compute payload hash, duplicate detection disabled for event', {
        topic: envelope.topic,
      });
      return undefined;
    }
  }

  private estimateSize(payload: unknown): number {
    try {
      const json = JSON.stringify(payload);
      return Buffer.byteLength(json, 'utf8');
    } catch {
      return Buffer.byteLength(String(payload), 'utf8');
    }
  }

  private buildMeta(topic: string, options: EmitOptions): EventEnvelope['meta'] {
    const meta: EventEnvelope['meta'] = {
      traceId: this.contextMeta?.traceId,
      spanId: this.contextMeta?.spanId,
      parentSpanId: this.contextMeta?.parentSpanId,
      requestId: this.contextMeta?.requestId,
      emitter: this.contextMeta?.emitter,
    };

    if (options.meta) {
      for (const [key, value] of Object.entries(options.meta)) {
        if (key === 'emitter') {
          if (typeof value === 'string') {
            meta.emitter = value;
          } else if (value != null) {
            meta.emitter = String(value);
          } else {
            delete meta.emitter;
          }
        } else {
          meta[key] = value;
        }
      }
    }

    if (meta.emitter === undefined && this.contextMeta?.pluginId) {
      meta.emitter = this.contextMeta.pluginId;
    }
    return meta;
  }

  private async guard(action: 'produce' | 'consume', topic: string, scope: EventScope): Promise<void> {
    try {
      if (this.hooks.enforcePermissions) {
        await this.hooks.enforcePermissions(action, topic, scope);
        return;
      }
    } catch (error) {
      await this.emitAnalytics(EVENT_DENIED, {
        topic,
        scope,
        action,
        reason: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    if (!this.permissions) {
      return;
    }

    const eventsPerms = this.permissions.events;
    if (!eventsPerms) {
      throw new BusError(
        'E_PLUGIN_EVENT_DENIED',
        'Events are disabled for this plugin',
        {
          topic,
          scope,
          action,
          remediation: 'Add permissions.events to the plugin manifest',
        }
      );
    }

    const scopes = eventsPerms.scopes ?? [];
    if (scopes.length > 0 && !scopes.includes(scope)) {
      throw new BusError(
        'E_PLUGIN_EVENT_DENIED',
        `Scope ${scope} not allowed`,
        {
          topic,
          scope,
          action,
          allowedScopes: scopes,
          remediation: `Include "${scope}" in permissions.events.scopes`,
        }
      );
    }

    const allowList = action === 'produce' ? eventsPerms.produce : eventsPerms.consume;
    if (allowList && allowList.length > 0) {
      const allowed = allowList.some(pattern => this.topicMatches(pattern, topic));
      if (!allowed) {
        throw new BusError(
          'E_PLUGIN_EVENT_DENIED',
          `Topic ${topic} not permitted`,
          {
            topic,
            scope,
            action,
            allowList,
            remediation: 'Add the topic or prefix to permissions.events.produce/consume',
          }
        );
      }
    }
  }

  private topicMatches(pattern: string, topic: string): boolean {
    if (pattern.endsWith('*')) {
      return topic.startsWith(pattern.slice(0, -1));
    }
    return pattern === topic;
  }

  private async emitAnalytics(event: string, payload: Record<string, unknown>): Promise<void> {
    try {
      await this.hooks.analytics?.(event, {
        ...payload,
        pluginId: this.contextMeta?.pluginId,
        pluginVersion: this.contextMeta?.pluginVersion,
      });
    } catch (error) {
      this.log('debug', 'Failed to emit analytics event', {
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>): void {
    try {
      this.hooks.logger?.(level, message, this.sanitiseMeta(meta));
    } catch {
      // No-op: logging should never throw.
    }
  }

  private sanitiseMeta(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!meta) return undefined;
    const redactKeys = this.config.redactKeys ?? DEFAULT_REDACT_KEYS;
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (redactKeys.includes(key.toLowerCase())) {
        clone[key] = '[redacted]';
      } else {
        clone[key] = value;
      }
    }
    return clone;
  }
}

export { BusError };

