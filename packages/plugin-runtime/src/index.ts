/**
 * @module @kb-labs/plugin-runtime
 * Plugin runtime execution engine
 */

// Capabilities
export {
  checkCapabilities,
  validateCapabilityNames,
  KNOWN_CAPABILITIES,
  type CapabilityCheckResult,
  type KnownCapability,
} from './capabilities';

// Permissions
export {
  checkFsPermission,
  checkNetPermission,
  checkEnvPermission,
  checkStatePermission,
  checkAllPermissions,
  type PermissionCheckResult,
  type PermissionCheckAllResult,
} from './permissions';

// Execution
export {
  execute,
} from './execute';

// Types
export type {
  ExecutionContext,
  RuntimeExtensions,
  RuntimeAPI,
  LegacyRuntimeAPI,
  PluginAPI,
  PluginOutput,
  PluginHandlerContext,
  ExecuteInput,
  ExecuteResult,
  ExecMetrics,
  HandlerRef,
  PluginHandler,
  FSLike,
  ErrorEnvelope,
  PermissionSpecSummary,
} from './types';

// Plugin handler builder
export {
  definePluginHandler,
  createTypedHandler,
  type PluginHandlerConfig,
  type InferInput,
  type InferOutput,
  type TypedPlugin,
  type ZodSchema,
} from './define-plugin-handler';

// Sandbox
export type { SandboxRunner } from './sandbox/runner';
export { nodeSubprocRunner } from './sandbox/node-subproc';
export { buildRuntime } from './sandbox/child/runtime';

// Errors
export {
  toErrorEnvelope,
  analyzeRootCause,
  analyzeRootCauseSync,
  type RootCauseAnalysis,
  type RootCauseType,
  createErrorContext,
} from './errors';

// Validation
export {
  validateManifestOnStartup,
  type ValidationResult,
} from './validation';

// IO
export { pickEnv, createEnvAccessor } from './io/env';
export { createWhitelistedFetch, isHostAllowed } from './io/net';
export { createFsShim } from './io/fs';
export { createStateAPI, type StateRuntimeAPI } from './io/state';

// Artifacts
export {
  writeArtifact,
  substitutePathTemplate,
  type ArtifactWriteContext,
} from './artifacts';

// Utils
export { createId, hashManifest } from './utils';

// Deprecation
export {
  deprecate,
  deprecateFunction,
  deprecateObject,
  resetDeprecationWarnings,
} from './deprecation';

// Registry
export type { PluginRegistry, ResolvedRoute } from './registry';

// Invoke
export { InvokeBroker } from './invoke/broker';
export { resolveInvokeDecision } from './invoke/permissions';
export type {
  InvokeRequest,
  InvokeResult,
  ChainLimits,
  InvokeContext,
  MountSpec,
} from './invoke/types';
export {
  applyHeaderTransforms,
  listHeaderTransforms,
} from './invoke/header-transforms';
export {
  loadCustomHeaderTransform,
  clearHeaderTransformCache,
  type HeaderTransformFn,
} from './invoke/transform-loader';

// Artifacts
export { ArtifactBroker, parseArtifactUri } from './artifacts/broker';
export type {
  ArtifactMeta,
  ArtifactStatus,
  ArtifactCapability,
  ArtifactReadRequest,
  ArtifactWriteRequest,
  ArtifactListRequest,
  ArtifactInfo,
} from './artifacts/broker';

// Snapshot
export {
  saveSnapshot,
  loadSnapshot,
  listSnapshots,
  rotateSnapshots,
  diffSnapshots,
  searchSnapshots,
  getDebugDir,
  getSnapshotsDir,
  type SnapshotData,
} from './snapshot';

// Suggestions
export {
  getSuggestions,
  formatSuggestions,
  type ErrorSuggestion,
} from './suggestions';

// Profiler utilities (re-export from sandbox)
export { formatTimeline, exportChromeFormat as exportProfileChromeFormat } from '@kb-labs/core-sandbox';
export type { ProfileData, ProfilePhase } from '@kb-labs/core-sandbox';

// Trace utilities
export {
  saveTrace,
  loadTrace,
  listTraces,
  rotateTraces,
  formatFlamegraph,
  exportChromeFormat,
  buildSpanTree,
  getTracesDir,
  type TraceData,
  type TraceSpan,
} from './trace';

// Mock utilities (for testing)
export {
  createMockFs,
  type MockFsOperation,
  type MockFsRecord,
} from './mocks/fs-mock';

// Events
export {
  createEventBus,
  acquirePluginBus,
  releasePluginBus,
  getPluginBusRefs,
  DEFAULT_CONFIG as DEFAULT_EVENT_BUS_CONFIG,
} from './events/index';
export type {
  EventBus,
  EventEnvelope,
  EventScope,
  EmitOptions as EventEmitOptions,
  SubscriptionOptions as EventSubscriptionOptions,
  WaitForOptions as EventWaitForOptions,
  EventBusConfig,
  EventBusError,
} from './events/index';

// Unified Plugin Context
export {
  createPluginContext,
  createPluginContextWithPlatform,
  createCapabilitySet,
  createEventSchemaRegistry,
  createNoopEventBridge,
  createIsolatedEventBridge,
  isKnownPluginHost,
  KNOWN_PLUGIN_HOSTS,
} from './context/index';
export type {
  PluginContext,
  PluginContextOptions,
  PluginContextMetadata,
  CreatePluginContextWithPlatformOptions,
  CapabilitySet,
  PluginEventDefinition,
  PluginEventEnvelope,
  PluginEventSchemaRegistry,
  PluginEventBridge,
  PluginHostType,
  KnownPluginHost,
  PresenterFacade,
  PresenterProgressPayload,
  PlatformServices,
  UIFacade,
} from './context/index';
export { CapabilityFlag } from './context/index';

// Presenters
export {
  TTYPresenter,
  JobRunnerPresenter,
  HttpPresenter,
  createNoopPresenter,
} from './presenter/index';
export type {
  TTYPresenterOptions,
  TTYPresenterFormatter,
  JobRunnerPresenterOptions,
  JobRunnerPresenterEvent,
  HttpPresenterOptions,
  PresenterMessageLevel,
  PresenterMessageOptions,
  PresenterEventPayload,
  ConfirmOptions,
} from './presenter/index';

export {
  OperationTracker,
  type TrackedOperation,
  type TrackedOperationStatus,
} from './operations/operation-tracker';
export {
  getTrackedOperations,
  clearTrackedOperations,
} from './operations/tracked-operations';

export {
  SmartConfigHelper,
  type EnsureSectionOptions,
  type EnsureSectionResult,
} from './config/config-helper';

// Logging
export {
  createRuntimeLogger,
  createPluginLogger,
  type RuntimeLogger,
  type PluginLogger,
} from './logging';

// Jobs (background and scheduled jobs)
export { JobBroker } from './jobs/broker';
export {
  checkSubmitPermission,
  checkSchedulePermission,
} from './jobs/permissions';
export { QuotaTracker } from './jobs/quotas';
export type {
  BackgroundJobRequest,
  ScheduledJobRequest,
  JobHandle,
  ScheduleHandle,
  JobStatus,
  ScheduleStatus,
  JobInfo,
  ScheduleInfo,
  JobResult,
  JobFilter,
  LogEntry,
} from './jobs/types';
