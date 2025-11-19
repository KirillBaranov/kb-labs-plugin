/**
 * @module @kb-labs/plugin-runtime/context/event-types
 * Typed event envelopes and schema registry utilities.
 */

import type { PluginHostType } from './host.js';

export type PluginEventType = string;

export interface PluginEventMeta {
  runId?: string;
  stepId?: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  host?: PluginHostType;
  [key: string]: unknown;
}

export interface PluginEventEnvelope<TPayload = unknown> {
  id: string;
  type: PluginEventType;
  version: string;
  timestamp: string;
  payload: TPayload;
  meta?: PluginEventMeta;
}

export interface PluginEventDefinition<TPayload = unknown> {
  type: PluginEventType;
  version: string;
  description?: string;
  examples?: TPayload[];
}

export interface PluginEventSchemaRegistry {
  register<TPayload>(definition: PluginEventDefinition<TPayload>): void;
  get(type: PluginEventType, version?: string): PluginEventDefinition | undefined;
  list(): PluginEventDefinition[];
}

class InMemoryEventSchemaRegistry implements PluginEventSchemaRegistry {
  private readonly definitions = new Map<string, PluginEventDefinition>();

  register(definition: PluginEventDefinition): void {
    const key = this.composeKey(definition.type, definition.version);
    this.definitions.set(key, definition);
  }

  get(type: PluginEventType, version?: string): PluginEventDefinition | undefined {
    if (version) {
      return this.definitions.get(this.composeKey(type, version));
    }

    // Try to find the highest version lexicographically when version not provided.
    const candidates = [...this.definitions.values()].filter((definition) => definition.type === type);
    if (candidates.length === 0) {
      return undefined;
    }

    return candidates.sort((a, b) => (a.version > b.version ? -1 : 1))[0];
  }

  list(): PluginEventDefinition[] {
    return [...this.definitions.values()];
  }

  private composeKey(type: string, version: string): string {
    return `${type}@${version}`;
  }
}

const sharedRegistry = new InMemoryEventSchemaRegistry();

/**
 * Provide a shared registry instance for hosts that do not need custom
 * isolation. Hosts can create their own registry if required.
 */
export function getDefaultEventSchemaRegistry(): PluginEventSchemaRegistry {
  return sharedRegistry;
}

/**
 * Create a fresh registry (primarily for testing or host-specific isolation).
 */
export function createEventSchemaRegistry(): PluginEventSchemaRegistry {
  return new InMemoryEventSchemaRegistry();
}


