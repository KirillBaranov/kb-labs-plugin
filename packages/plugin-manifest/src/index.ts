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
  JobDecl,
  // Platform requirements
  PlatformRequirements,
  PlatformServiceId,
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
  platformServiceIdSchema,
  platformRequirementsSchema,
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
// Note: createManifestV2 and defineCommandFlags moved to @kb-labs/shared-command-kit
// Use defineManifest and defineCommandFlags from command-kit instead
export {
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
