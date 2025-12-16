/**
 * @kb-labs/plugin-runtime-v3
 *
 * V3 Plugin System Runtime - Context factory, sandboxed shims, and APIs.
 */

// Context
export {
  createPluginContextV3,
  createTraceContext,
  type CreateContextOptions,
  type CreateContextResult,
  type CreateTraceContextOptions,
} from './context/index.js';

// Runtime (sandboxed shims)
export {
  createRuntimeAPI,
  createFSShim,
  createFetchShim,
  createEnvShim,
  type CreateFSShimOptions,
  type CreateRuntimeAPIOptions,
} from './runtime/index.js';

// API
export {
  createPluginAPI,
  createLifecycleAPI,
  createOutputAPI,
  createStateAPI,
  createArtifactsAPI,
  createShellAPI,
  createEventsAPI,
  createNoopEventsAPI,
  createInvokeAPI,
  createNoopInvokeAPI,
  executeCleanup,
  type CreatePluginAPIOptions,
  type EventEmitterFn,
  type PluginInvokerFn,
} from './api/index.js';

// Utils
export {
  createId,
  createShortId,
  extractTraceId,
  createRequestId,
} from './utils/index.js';

// Re-export contracts for convenience
export type {
  PluginContextV3,
  PluginContextDescriptor,
  HostContext,
  HostType,
  PermissionSpec,
  UIFacade,
  Spinner,
  TraceContext,
  PlatformServices,
  RuntimeAPI,
  PluginAPI,
  CleanupFn,
} from '@kb-labs/plugin-contracts-v3';
