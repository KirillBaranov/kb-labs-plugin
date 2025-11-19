/**
 * @module @kb-labs/plugin-runtime/events/types
 * Shared types for the sandbox EventBus implementation.
 */

import type { PermissionSpec } from '@kb-labs/plugin-manifest';

/**
 * Event scopes supported by the in-memory bus.
 *
 * - `local`  – confined to the current execution chain (default)
 * - `plugin` – shared across all executions for the same plugin within the process
 */
export type EventScope = 'local' | 'plugin';

/**
 * Policy to apply when a queue limit is reached.
 */
export type DropPolicy = 'drop-oldest' | 'drop-new';

/**
 * Envelope delivered to handlers.
 */
export interface EventEnvelope<T = unknown> {
  /** Globally unique event identifier */
  eventId: string;
  /** Optional caller supplied idempotency key */
  idempotencyKey?: string;
  /** Topic name (e.g. foo.bar@v1) */
  topic: string;
  /** Scope of delivery */
  scope: EventScope;
  /** Unix timestamp (ms) when event was emitted */
  ts: number;
  /** User payload */
  payload: T;
  /** Metadata propagated alongside the event */
  meta: {
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    requestId?: string;
    emitter?: string;
    /**
     * Arbitrary extensions (e.g. schema id).
     * Kept generic to avoid hard dependencies inside the runtime.
     */
    [key: string]: unknown;
  };
}

/**
 * Handler signature exposed to plugin authors.
 */
export type EventHandler<T = unknown> = (event: EventEnvelope<T>) => void | Promise<void>;

/**
 * Options accepted by emit().
 */
export interface EmitOptions {
  /** Override scope (defaults to local) */
  scope?: EventScope;
  /** Explicit idempotency key (otherwise derived from payload hash) */
  idempotencyKey?: string;
  /** Additional metadata to merge into the envelope meta object */
  meta?: Record<string, unknown>;
  /** Abort controller to cancel queued emit before delivery */
  signal?: AbortSignal;
  /** Explicit timeout (ms) – overrides bus default for queue wait */
  timeoutMs?: number;
}

/**
 * Options accepted by on/once/off.
 */
export interface SubscriptionOptions {
  scope?: EventScope;
  /** Max number of invocations per listener (defaults to Infinity) */
  maxInvocations?: number;
  /** Abort signal to auto-unsubscribe */
  signal?: AbortSignal;
}

/**
 * Options for waitFor.
 */
export interface WaitForOptions<T = unknown> {
  scope?: EventScope;
  predicate?: (event: EventEnvelope<T>) => boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Bus level configuration supplied by the runtime host.
 */
export interface EventBusConfig {
  /** Maximum allowed payload size in bytes */
  maxPayloadBytes: number;
  /** Maximum listeners per topic per scope */
  maxListenersPerTopic: number;
  /** Maximum queued events per scope */
  maxQueueSize: number;
  /** Drop policy when the queue is saturated */
  dropPolicy: DropPolicy;
  /** Sliding window quota (events per minute) */
  eventsPerMinute: number;
  /** Maximum number of concurrent handler executions per scope */
  concurrentHandlers: number;
  /** Size of duplicate id cache for idempotency */
  duplicateCacheSize: number;
  /** TTL (ms) for cached duplicate ids */
  duplicateTtlMs: number;
  /** Default timeout for waitFor (ms) */
  defaultWaitTimeoutMs: number;
  /** Default timeout for queue drain on shutdown */
  shutdownTimeoutMs: number;
  /** Keys to mask when logging payloads */
  redactKeys?: string[];
}

/**
 * Runtime provided dependencies to integrate with the host.
 */
export interface EventBusRuntimeHooks {
  /** Analytics emitter (best-effort, swallow errors) */
  analytics?: (event: string, payload: Record<string, unknown>) => Promise<void>;
  /** Structured logger (level, message, metadata) */
  logger?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => void;
  /**
   * Permission gate invoked during emit/on/wait operations.
   * Should throw if topic/scope is forbidden.
   */
  enforcePermissions?: (action: 'produce' | 'consume', topic: string, scope: EventScope) => void | Promise<void>;
  /** Hook called when artifacts topics are emitted automatically */
  onSystemEvent?: (envelope: EventEnvelope) => void;
}

/**
 * Combined initialisation parameters.
 */
export interface EventBusInit {
  config: EventBusConfig;
  hooks?: EventBusRuntimeHooks;
  /**
   * Snapshot of permissions resolved for the current execution.
   * Used for deny-by-default if enforcePermissions hook is not supplied.
   */
  permissions?: PermissionSpec;
  /**
   * Context metadata propagated into envelopes.
   */
  contextMeta?: {
    pluginId?: string;
    pluginVersion?: string;
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
    requestId?: string;
    emitter?: string;
  };
}

/**
 * Public EventBus contract exposed to runtime consumers.
 */
export interface EventBus {
  emit<T = unknown>(topic: string, payload: T, options?: EmitOptions): Promise<EventEnvelope<T> | null>;
  on<T = unknown>(topic: string, handler: EventHandler<T>, options?: SubscriptionOptions): () => void;
  once<T = unknown>(topic: string, handler: EventHandler<T>, options?: SubscriptionOptions): () => void;
  off<T = unknown>(topic: string, handler?: EventHandler<T>, options?: SubscriptionOptions): void;
  waitFor<T = unknown>(topic: string, predicate?: (event: EventEnvelope<T>) => boolean, options?: WaitForOptions<T>): Promise<EventEnvelope<T>>;
  shutdown(options?: { timeoutMs?: number }): Promise<void>;
}

/**
 * Error shape used by the EventBus to convey actionable failure cases.
 */
export class EventBusError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EventBusError';
    this.code = code;
    this.details = details;
  }
}


