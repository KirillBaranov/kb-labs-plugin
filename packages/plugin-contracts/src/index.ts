/**
 * @kb-labs/plugin-contracts
 *
 * V3 Plugin System Contracts - Pure types with 0 runtime dependencies.
 *
 * This package contains all type definitions for the V3 plugin system.
 * It has NO runtime dependencies and can be used safely in any context.
 */

// Context
export type { PluginContextV3, ExtractConfig } from './context.js';

// Descriptor (for IPC)
export type { PluginContextDescriptor } from './descriptor.js';

// Host Context
export type {
  HostContext,
  HostType,
  CliHostContext,
  RestHostContext,
  WorkflowHostContext,
  WebhookHostContext,
} from './host-context.js';

// Permissions
export type { PermissionSpec } from './permissions.js';
export { DEFAULT_PERMISSIONS } from './permissions.js';

// UI
export type {
  UIFacade,
  Colors,
  Symbols,
  ColorFunction,
  Spinner,
  TableColumn,
  PromptOptions,
  SideBoxOptions,
  OutputSection,
  MessageOptions,
} from './ui.js';
export { noopUI } from './ui.js';

// Trace
export type {
  TraceContext,
  TraceSpanStatus,
  TraceSpanData,
  TraceEvent,
} from './trace.js';
export { noopTraceContext } from './trace.js';

// Errors
export {
  PluginError,
  PermissionError,
  TimeoutError,
  AbortError,
  ConfigError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  PlatformError,
  ErrorCode,
  isPluginError,
  wrapError,
} from './errors.js';
export type { SerializedError, ErrorCodeType } from './errors.js';

// Runtime
export type {
  RuntimeAPI,
  FSShim,
  FetchShim,
  EnvShim,
  FileStat,
  DirEntry,
  MkdirOptions,
  RmOptions,
  WriteFileOptions,
} from './runtime.js';

// Platform
export type {
  PlatformServices,
  Logger,
  LLMAdapter,
  LLMOptions,
  LLMResponse,
  EmbeddingsAdapter,
  VectorStoreAdapter,
  VectorSearchResult,
  VectorRecord,
  VectorFilter,
  CacheAdapter,
  StorageAdapter,
  AnalyticsAdapter,
} from './platform.js';

// API
export type {
  PluginAPI,
  InvokeAPI,
  InvokeOptions,
  StateAPI,
  ArtifactsAPI,
  ArtifactInfo,
  ShellAPI,
  ExecResult,
  ExecOptions,
  EventsAPI,
  LifecycleAPI,
  CleanupFn,
} from './api.js';

// Handlers
export type {
  CommandHandler,
  CommandDefinition,
  CommandResult,
  CommandResultWithMeta,
  StandardMeta,
  RestHandler,
  RestRequest,
  RestResponse,
  RestDefinition,
  WorkflowHandler,
  WorkflowDefinition,
  WebhookHandler,
  WebhookDefinition,
} from './handlers.js';

// Manifest
export type {
  ManifestV3,
  SchemaRef,
  DisplayMetadata,
  PluginDependency,
  PlatformRequirements,
  CliFlagDecl,
  CliCommandDecl,
  RestRouteDecl,
  RestConfig,
  WorkflowHandlerDecl,
  WebhookHandlerDecl,
  JobDecl,
  SetupSpec,
  ErrorSpec,
  // Studio types
  StudioConfig,
  StudioWidgetDecl,
  StudioMenuDecl,
  StudioLayoutDecl,
  DataSource,
  WidgetAction,
  ActionHandler,
} from './manifest.js';
export { isManifestV3, getHandlerPath, getHandlerPermissions } from './manifest.js';
export { parseManifest, validateManifest, resolveHeaderPolicy } from './manifest-loader.js';
