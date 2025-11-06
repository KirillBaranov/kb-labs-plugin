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
  SchemaRef,
  DataSource,
  ArtifactDecl,
  CliFlagDecl,
  CliCommandDecl,
  ErrorSpec,
  RestRouteDecl,
  StudioWidgetDecl,
  StudioMenuDecl,
  StudioLayoutDecl,
  DisplayMetadata,
} from './types.js';

// Runtime contracts
export type { PluginContext, Handler } from './runtime.js';

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
