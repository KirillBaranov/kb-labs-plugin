/**
 * @module @kb-labs/plugin-runtime/events/factory
 * Helpers for constructing scoped EventBus instances.
 */

import { ScopedEventBus } from './event-bus.js';
import type {
  EventBus,
  EventBusConfig,
  EventBusInit,
  EventScope,
} from './types.js';

const DEFAULT_CONFIG: EventBusConfig = {
  maxPayloadBytes: 128 * 1024,
  maxListenersPerTopic: 32,
  maxQueueSize: 256,
  dropPolicy: 'drop-oldest',
  eventsPerMinute: 600,
  concurrentHandlers: 16,
  duplicateCacheSize: 256,
  duplicateTtlMs: 5 * 60_000,
  defaultWaitTimeoutMs: 30_000,
  shutdownTimeoutMs: 5_000,
  redactKeys: ['authorization', 'apikey', 'token', 'password', 'secret'],
};

type PluginBusKey = string;

interface PluginBusEntry {
  bus: ScopedEventBus;
  refs: number;
  config: EventBusConfig;
  scopes: Set<EventScope>;
}

const pluginBusRegistry: Map<PluginBusKey, PluginBusEntry> = new Map();

export function createEventBus(init: EventBusInit): ScopedEventBus {
  return new ScopedEventBus(normaliseInit(init));
}

export function acquirePluginBus(key: PluginBusKey, init: EventBusInit): EventBus {
  const entry = pluginBusRegistry.get(key);
  if (entry) {
    entry.refs += 1;
    return entry.bus;
  }

  const bus = new ScopedEventBus(normaliseInit(init));
  pluginBusRegistry.set(key, {
    bus,
    refs: 1,
    config: bus.config,
    scopes: new Set(['plugin']),
  });
  return bus;
}

export async function releasePluginBus(key: PluginBusKey, options?: { timeoutMs?: number }): Promise<void> {
  const entry = pluginBusRegistry.get(key);
  if (!entry) return;

  entry.refs -= 1;
  if (entry.refs <= 0) {
    pluginBusRegistry.delete(key);
    await entry.bus.shutdown(options);
  }
}

export function getPluginBusRefs(): ReadonlyMap<string, PluginBusEntry> {
  return pluginBusRegistry;
}

function normaliseInit(init: EventBusInit): EventBusInit {
  return {
    ...init,
    config: {
      ...DEFAULT_CONFIG,
      ...init.config,
      redactKeys: init.config.redactKeys ?? DEFAULT_CONFIG.redactKeys,
    },
  };
}

export { DEFAULT_CONFIG };

