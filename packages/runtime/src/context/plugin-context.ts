/**
 * @module @kb-labs/plugin-runtime/context/plugin-context
 * Unified PluginContext factory and supporting types.
 */

import type { ArtifactBroker } from '../artifacts/broker.js';
import type { InvokeBroker } from '../invoke/broker.js';
import type { JobBroker } from '../jobs/broker.js';
import {
  createNoopPresenter,
  type PresenterFacade,
  type PresenterProgressPayload,
} from '../presenter/presenter-facade.js';
import {
  createNoopAnalyticsEmitter,
  type AnalyticsEmitter,
  type AnalyticsEmitOptions,
} from '../analytics/emitter.js';
import {
  createNoopEventBridge,
  type PluginEventBridge,
} from './plugin-events.js';
import {
  CapabilityFlag,
  createCapabilitySet,
  type CapabilitySet,
} from './capabilities.js';
import type {
  PluginEventDefinition,
  PluginEventEnvelope,
  PluginEventSchemaRegistry,
} from './event-types.js';
import type { PluginHostType } from './host.js';
import type { OperationWithMetadata } from '@kb-labs/setup-operations';

export interface PluginContextMetadata {
  /**
    * Optional workflow run identifier (when executed via workflow host).
    */
  runId?: string;
  /**
    * Optional workflow step identifier.
    */
  stepId?: string;
  /**
    * Additional host-specific metadata.
    */
  [key: string]: unknown;
}

export interface PluginContext {
  host: PluginHostType;
  requestId: string;
  pluginId: string;
  pluginVersion: string;
  tenantId?: string;
  presenter: PresenterFacade;
  events: PluginEventBridge;
  analytics: AnalyticsEmitter;
  artifacts?: ArtifactBroker;
  invoke?: InvokeBroker;
  jobs?: JobBroker;
  capabilities: CapabilitySet;
  metadata?: PluginContextMetadata;
  getTrackedOperations?: () => OperationWithMetadata[];
}

export interface PluginContextOptions {
  requestId: string;
  pluginId: string;
  pluginVersion: string;
  tenantId?: string;
  presenter?: PresenterFacade;
  events?: PluginEventBridge;
  analytics?: AnalyticsEmitter;
  artifacts?: ArtifactBroker;
  invoke?: InvokeBroker;
  jobs?: JobBroker;
  capabilities?: Iterable<CapabilityFlag>;
  metadata?: PluginContextMetadata;
  /**
   * Hook to expose tracked operations captured by the runtime.
   */
  getTrackedOperations?: () => OperationWithMetadata[];
  /**
   * Event definitions to pre-register on the bridge.
   */
  eventDefinitions?: PluginEventDefinition[];
}

/**
 * Create a unified `PluginContext` for the specified host.
 */
export function createPluginContext(
  host: PluginHostType,
  options: PluginContextOptions,
): PluginContext {
  const presenter = options.presenter ?? createNoopPresenter();
  const events = options.events ?? createNoopEventBridge();
  const analytics = options.analytics ?? createNoopAnalyticsEmitter();

  if (options.eventDefinitions) {
    for (const definition of options.eventDefinitions) {
      events.register(definition);
    }
  }

  const capabilitySet = createCapabilitySet(options.capabilities);
  const presenterProvided = options.presenter !== undefined;
  const eventsProvided = options.events !== undefined;
  const analyticsProvided = options.analytics !== undefined;
  const artifactsProvided = options.artifacts !== undefined;
  const invokeProvided = options.invoke !== undefined;
  const jobsProvided = options.jobs !== undefined;
  const getTrackedOperationsFn = options.getTrackedOperations;

  if (presenterProvided) {
    capabilitySet.extend([
      CapabilityFlag.PresenterMessage,
      CapabilityFlag.PresenterProgress,
      CapabilityFlag.PresenterJson,
      CapabilityFlag.PresenterError,
    ]);
  }

  if (eventsProvided) {
    capabilitySet.extend([
      CapabilityFlag.EventsEmit,
      CapabilityFlag.EventsSchemaRegistration,
    ]);
  }

  if (analyticsProvided) {
    capabilitySet.extend([CapabilityFlag.AnalyticsEmit]);
    if (typeof analytics.flush === 'function') {
      capabilitySet.extend([CapabilityFlag.AnalyticsFlush]);
    }
  }

  if (artifactsProvided) {
    capabilitySet.extend([
      CapabilityFlag.ArtifactsRead,
      CapabilityFlag.ArtifactsWrite,
    ]);
  }

  if (invokeProvided) {
    capabilitySet.extend([CapabilityFlag.Invoke]);
  }

  if (jobsProvided) {
    capabilitySet.extend([CapabilityFlag.JobsSubmit, CapabilityFlag.JobsSchedule]);
  }

  if (options.tenantId) {
    capabilitySet.extend([CapabilityFlag.MultiTenant]);
  }

  return Object.freeze({
    host,
    requestId: options.requestId,
    pluginId: options.pluginId,
    pluginVersion: options.pluginVersion,
    tenantId: options.tenantId,
    presenter,
    events,
    analytics,
    artifacts: options.artifacts,
    invoke: options.invoke,
    jobs: options.jobs,
    capabilities: capabilitySet,
    metadata: options.metadata,
    getTrackedOperations: getTrackedOperationsFn,
  }) satisfies PluginContext;
}

export type {
  PluginEventDefinition,
  PluginEventEnvelope,
  PluginEventSchemaRegistry,
  PresenterFacade,
  PresenterProgressPayload,
  AnalyticsEmitter,
  AnalyticsEmitOptions,
  PluginEventBridge,
};



