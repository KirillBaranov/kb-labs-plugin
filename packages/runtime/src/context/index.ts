/**
 * @module @kb-labs/plugin-runtime/context
 * Context building and broker factory utilities
 */

export {
  initializeChainLimits,
  initializeChainState,
  createRemainingMsCalculator,
  buildExecutionContext,
} from './context-builder';
export {
  createArtifactBroker,
  createInvokeBroker,
  createShellBroker,
} from './broker-factory';
export { createAnalyticsEmitter } from './analytics-factory';
export {
  createPluginContext,
  type PluginContext,
  type PluginContextOptions,
  type PluginContextMetadata,
  type PluginEventDefinition,
  type PluginEventEnvelope,
  type PluginEventSchemaRegistry,
  type PluginEventBridge,
  type PresenterFacade,
  type PresenterProgressPayload,
  type AnalyticsEmitter,
  type AnalyticsEmitOptions,
} from './plugin-context';
export {
  KNOWN_PLUGIN_HOSTS,
  isKnownPluginHost,
  type PluginHostType,
  type KnownPluginHost,
} from './host';
export {
  CapabilityFlag,
  createCapabilitySet,
  type CapabilitySet,
} from './capabilities';
export {
  getDefaultEventSchemaRegistry,
  createEventSchemaRegistry,
  type PluginEventSchemaRegistry as PluginEventSchemaRegistryType,
  type PluginEventDefinition as PluginEventDefinitionType,
} from './event-types';
export {
  createNoopEventBridge,
  createIsolatedEventBridge,
} from './plugin-events';
export {
  validateExecutionContext,
  applyFixes,
  formatValidationResult,
  validateAndFix,
  STANDARD_CONTEXT_RULES,
  type ContextValidationRule,
  type ContextValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidationFix,
} from './context-validator';


