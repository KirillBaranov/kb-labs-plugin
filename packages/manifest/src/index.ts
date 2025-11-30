/**
 * @module @kb-labs/plugin-manifest
 * Plugin Manifest v2 - types, validation, migration
 */

// Types
export type {
  ManifestV2,
  ManifestV1,
  PermissionSpec,
  InvokePermission,
  ArtifactAccess,
  ShellPermission,
  ShellCommandPattern,
  StatePermission,
  StateNamespaceAccess,
  SchemaRef,
  DataSource,
  ArtifactDecl,
  CliFlagDecl,
  CliCommandDecl,
  ErrorSpec,
  RestRouteDecl,
  HeaderMatch,
  HeaderRule,
  HeaderPolicy,
  HeadersConfig,
  HeaderValidator,
  SecurityHeaders,
  StudioWidgetDecl,
  StudioMenuDecl,
  StudioLayoutDecl,
  DisplayMetadata,
} from './types';

// Runtime contracts
export type { PluginContext, Handler } from './runtime';

// Studio widget data contracts
export type {
  CardData,
  CardListData,
  InfoPanelSection,
  InfoPanelData,
  KeyValueItem,
  KeyValueData,
} from './studio-widgets';

// Validation
export {
  validateManifestV2,
  manifestV2Schema,
  permissionSpecSchema,
  schemaRefSchema,
  type ValidationResult,
} from './schema';

// Migration
export { migrateV1ToV2 } from './migrate';

// Compatibility
export {
  detectManifestVersion,
  checkDualManifest,
  type DualManifestCheck,
} from './compat';

// Deprecation
export {
  DEPRECATION_DATES,
  isV1Allowed,
  getDeprecationWarning,
  shouldUseV1,
} from './deprecation';

// Helpers
export {
  createManifestV2,
  defineCommandFlags,
  type ExtractArtifactIdsFromContracts,
  type ExtractCommandIdsFromContracts,
  // Example generation
  generateExamples,
  exampleBuilder,
  type ExampleTemplate,
  ExampleBuilder,
} from './helpers';

// Migration helpers
export {
  migrateToCreateManifest,
  extractContractsFromManifest,
  generateZodSchemasFromContracts,
  generateContractFile,
} from './migration-helpers';
