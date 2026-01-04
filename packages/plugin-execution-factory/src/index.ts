/**
 * @module @kb-labs/plugin-execution-factory
 *
 * Factory for creating execution backends - extracted to break circular dependencies.
 *
 * This package was extracted from @kb-labs/plugin-execution to eliminate the circular dependency:
 * core-runtime ↔ plugin-execution ↔ plugin-runtime
 *
 * Now the dependency chain is clean:
 * plugin-runtime → plugin-execution-factory → core-runtime
 *
 * @example
 * ```typescript
 * import { createExecutionBackend } from '@kb-labs/plugin-execution-factory';
 *
 * const backend = createExecutionBackend({ platform });
 * ```
 */

// Factory
export { createExecutionBackend } from './factory.js';

// Backends
export {
  InProcessBackend,
  type InProcessBackendOptions,
} from './backends/in-process.js';

export {
  SubprocessBackend,
  type SubprocessBackendOptions,
} from './backends/subprocess.js';

export {
  WorkerPoolBackend,
  type WorkerPoolBackendOptions,
} from './backends/worker-pool/backend.js';

// Adapters
export { SubprocessRunnerAdapter } from './adapters/index.js';

// Workspace
export {
  type WorkspaceManager,
  type WorkspaceLeaseContext,
  type WorkspaceLease,
  LocalWorkspaceManager,
  localWorkspaceManager,
} from './workspace/index.js';

// Types
export type {
  ExecutionBackend,
  BackendOptions,
  WorkerPoolOptions,
  WarmupPolicy,
  ExecutionRequest,
  ExecutionResult,
  ExecutionError,
  HealthStatus,
  ExecutionStats,
} from './types.js';
