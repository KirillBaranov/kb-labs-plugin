/**
 * @module @kb-labs/plugin-runtime/context
 * Context building and broker factory utilities
 */

export {
  createPluginContext,
  // V1 compatibility (deprecated - use V2 for new code)
  type PluginContext,
  type PluginContextOptions,
  type PluginContextMetadata,
  type PlatformServices,
  type UIFacade,
  type PresenterFacade,
  type PresenterProgressPayload,
} from './plugin-context';

// V2 types (primary - recommended for new code) - import from v2 file
export type {
  PluginContextV2,
  RuntimeAdapter,
} from './plugin-context-v2';
export {
  createPluginContextWithPlatform,
  type CreatePluginContextWithPlatformOptions,
} from './plugin-context-factory';
// Event types are now exported from event-types.ts
export type {
  PluginEventDefinition,
  PluginEventEnvelope,
  PluginEventSchemaRegistry,
} from './event-types';
// Plugin event bridge from plugin-events.ts
export type { PluginEventBridge } from './plugin-events';
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


