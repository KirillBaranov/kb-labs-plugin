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
} from './types.js';

// Runtime contracts
export type { PluginContext, Handler } from './runtime.js';

// Studio widget data contracts
export type {
  CardData,
  CardListData,
  InfoPanelSection,
  InfoPanelData,
  KeyValueItem,
  KeyValueData,
} from './studio-widgets.js';

// Validation
export {
  validateManifestV2,
  manifestV2Schema,
  permissionSpecSchema,
  schemaRefSchema,
  type ValidationResult,
} from './schema.js';

// Migration
export { migrateV1ToV2 } from './migrate.js';

// Compatibility
export {
  detectManifestVersion,
  checkDualManifest,
  type DualManifestCheck,
} from './compat.js';

// Deprecation
export {
  DEPRECATION_DATES,
  isV1Allowed,
  getDeprecationWarning,
  shouldUseV1,
} from './deprecation.js';

// Helpers
export {
  createManifestV2,
  defineCommandFlags,
  type ExtractArtifactIdsFromContracts,
  type ExtractCommandIdsFromContracts,
} from './helpers.js';

// Migration helpers
export {
  migrateToCreateManifest,
  extractContractsFromManifest,
  generateZodSchemasFromContracts,
  generateContractFile,
} from './migration-helpers.js';
