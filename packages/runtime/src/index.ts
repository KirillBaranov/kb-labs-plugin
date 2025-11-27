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
} from './capabilities.js';

// Permissions
export {
  checkFsPermission,
  checkNetPermission,
  checkEnvPermission,
  checkAllPermissions,
  type PermissionCheckResult,
  type PermissionCheckAllResult,
} from './permissions.js';

// Execution
export {
  execute,
} from './execute.js';

// Types
export type {
  ExecutionContext,
  RuntimeExtensions,
  RuntimeAPI,
  ExecuteInput,
  ExecuteResult,
  ExecMetrics,
  HandlerRef,
  PluginHandler,
  FSLike,
  ErrorEnvelope,
  PermissionSpecSummary,
} from './types.js';

// Sandbox
export type { SandboxRunner } from './sandbox/runner.js';
export { nodeSubprocRunner } from './sandbox/node-subproc.js';
export { buildRuntime } from './sandbox/child/runtime.js';

// Errors
export {
  toErrorEnvelope,
  analyzeRootCause,
  analyzeRootCauseSync,
  type RootCauseAnalysis,
  type RootCauseType,
  createErrorContext,
} from './errors.js';

// Validation
export {
  validateManifestOnStartup,
  type ValidationResult,
} from './validation.js';

// IO
export { pickEnv, createEnvAccessor } from './io/env.js';
export { createWhitelistedFetch, isHostAllowed } from './io/net.js';
export { createFsShim } from './io/fs.js';

// Artifacts
export {
  writeArtifact,
  substitutePathTemplate,
  type ArtifactWriteContext,
} from './artifacts.js';

// Analytics
export { emitAnalyticsEvent, setTelemetryEmitter, getTelemetryEmitter } from './analytics.js';
export { createNoopAnalyticsEmitter } from './analytics/emitter.js';

// Utils
export { createId, hashManifest } from './utils.js';

// Registry
export type { PluginRegistry, ResolvedRoute } from './registry.js';

// Invoke
export { InvokeBroker } from './invoke/broker.js';
export { resolveInvokeDecision } from './invoke/permissions.js';
export type {
  InvokeRequest,
  InvokeResult,
  ChainLimits,
  InvokeContext,
  MountSpec,
} from './invoke/types.js';
export {
  applyHeaderTransforms,
  listHeaderTransforms,
} from './invoke/header-transforms.js';
export {
  loadCustomHeaderTransform,
  clearHeaderTransformCache,
  type HeaderTransformFn,
} from './invoke/transform-loader.js';

// Artifacts
export { ArtifactBroker, parseArtifactUri } from './artifacts/broker.js';
export type {
  ArtifactMeta,
  ArtifactStatus,
  ArtifactCapability,
  ArtifactReadRequest,
  ArtifactWriteRequest,
  ArtifactListRequest,
  ArtifactInfo,
} from './artifacts/broker.js';

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
} from './snapshot.js';

// Suggestions
export {
  getSuggestions,
  formatSuggestions,
  type ErrorSuggestion,
} from './suggestions.js';

// Profiler utilities (re-export from sandbox)
export { formatTimeline, exportChromeFormat as exportProfileChromeFormat } from '@kb-labs/sandbox';
export type { ProfileData, ProfilePhase } from '@kb-labs/sandbox';

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
} from './trace.js';

// Mock utilities (for testing)
export {
  createMockFs,
  type MockFsOperation,
  type MockFsRecord,
} from './mocks/fs-mock.js';

// Events
export {
  createEventBus,
  acquirePluginBus,
  releasePluginBus,
  getPluginBusRefs,
  DEFAULT_CONFIG as DEFAULT_EVENT_BUS_CONFIG,
} from './events/index.js';
export type {
  EventBus,
  EventEnvelope,
  EventScope,
  EmitOptions as EventEmitOptions,
  SubscriptionOptions as EventSubscriptionOptions,
  WaitForOptions as EventWaitForOptions,
  EventBusConfig,
  EventBusError,
} from './events/index.js';

// Unified Plugin Context
export {
  createPluginContext,
  createCapabilitySet,
  createEventSchemaRegistry,
  createNoopEventBridge,
  createIsolatedEventBridge,
  isKnownPluginHost,
  KNOWN_PLUGIN_HOSTS,
} from './context/index.js';
export type {
  PluginContext,
  PluginContextOptions,
  PluginContextMetadata,
  CapabilitySet,
  PluginEventDefinition,
  PluginEventEnvelope,
  PluginEventSchemaRegistry,
  PluginEventBridge,
  PluginHostType,
  KnownPluginHost,
  PresenterFacade,
  PresenterProgressPayload,
  AnalyticsEmitter,
  AnalyticsEmitOptions,
} from './context/index.js';
export { CapabilityFlag } from './context/index.js';

// Presenters
export {
  TTYPresenter,
  JobRunnerPresenter,
  HttpPresenter,
  createNoopPresenter,
} from './presenter/index.js';
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
} from './presenter/index.js';

export {
  OperationTracker,
  type TrackedOperation,
  type TrackedOperationStatus,
} from './operations/operation-tracker.js';
export {
  getTrackedOperations,
  clearTrackedOperations,
} from './operations/tracked-operations.js';

export {
  SmartConfigHelper,
  type EnsureSectionOptions,
  type EnsureSectionResult,
} from './config/config-helper.js';

// Logging
export {
  createRuntimeLogger,
  createPluginLogger,
  type RuntimeLogger,
  type PluginLogger,
} from './logging.js';
