/**
 * @module @kb-labs/plugin-runtime/context/plugin-events
 * Event bridge abstraction wired into PluginContext.
 */

import { createEventSchemaRegistry, getDefaultEventSchemaRegistry } from './event-types';
import type {
  PluginEventDefinition,
  PluginEventEnvelope,
  PluginEventSchemaRegistry,
} from './event-types';

export interface PluginEventBridge {
  emit<TPayload>(event: PluginEventEnvelope<TPayload>): Promise<void>;
  register<TPayload>(definition: PluginEventDefinition<TPayload>): void;
  schemas(): PluginEventSchemaRegistry;
}

class NoopEventBridge implements PluginEventBridge {
  constructor(private readonly registry: PluginEventSchemaRegistry) {}

  async emit(): Promise<void> {
    // intentionally empty
  }

  register<TPayload>(definition: PluginEventDefinition<TPayload>): void {
    this.registry.register(definition);
  }

  schemas(): PluginEventSchemaRegistry {
    return this.registry;
  }
}

/**
 * Shared no-op bridge used when hosts do not provide an event bridge.
 */
const noopBridge = new NoopEventBridge(getDefaultEventSchemaRegistry());

export function createNoopEventBridge(): PluginEventBridge {
  return noopBridge;
}

/**
 * Helper to create an isolated bridge with its own registry.
 */
export function createIsolatedEventBridge(): PluginEventBridge {
  return new NoopEventBridge(createEventSchemaRegistry());
}


