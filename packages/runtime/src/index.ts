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

// Errors
export {
  toErrorEnvelope,
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
export { emitAnalyticsEvent } from './analytics.js';

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
