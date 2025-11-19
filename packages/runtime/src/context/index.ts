/**
 * @module @kb-labs/plugin-runtime/context
 * Context building and broker factory utilities
 */

export {
  initializeChainLimits,
  initializeChainState,
  createRemainingMsCalculator,
  buildExecutionContext,
} from './context-builder.js';
export {
  createArtifactBroker,
  createInvokeBroker,
  createShellBroker,
} from './broker-factory.js';
export { createAnalyticsEmitter } from './analytics-factory.js';
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
} from './plugin-context.js';
export {
  KNOWN_PLUGIN_HOSTS,
  isKnownPluginHost,
  type PluginHostType,
  type KnownPluginHost,
} from './host.js';
export {
  CapabilityFlag,
  createCapabilitySet,
  type CapabilitySet,
} from './capabilities.js';
export {
  getDefaultEventSchemaRegistry,
  createEventSchemaRegistry,
  type PluginEventSchemaRegistry as PluginEventSchemaRegistryType,
  type PluginEventDefinition as PluginEventDefinitionType,
} from './event-types.js';
export {
  createNoopEventBridge,
  createIsolatedEventBridge,
} from './plugin-events.js';
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
} from './context-validator.js';


