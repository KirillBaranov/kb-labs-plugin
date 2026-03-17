/**
 * @module @kb-labs/plugin-execution-factory/isolated-backend
 *
 * createIsolatedExecutionBackend — unified factory for all hosts (workflow, rest-api, webhook, etc).
 *
 * Encapsulates execution plane routing and provisioning:
 *   - requests with target.environmentId → RemoteBackend (explicit override / pre-provisioned)
 *   - requests without environmentId + provisionEnvironment → auto-provision → RemoteBackend
 *   - requests without environmentId, no provisionEnvironment → local backend
 *
 * Hosts are dumb — they call backend.execute() and get results.
 * All provisioning (workspace, environment, cleanup) is handled here.
 *
 * Layer discipline:
 *   core-contracts  ← IExecutionTransport (interface)
 *   this file       ← StrictIsolationOptions + createIsolatedExecutionBackend()
 *   gateway-core    ← GatewayDispatchTransport (implements IExecutionTransport)
 *   loader.ts       ← wires transport + provisionEnvironment into StrictIsolationOptions
 */

import type { IExecutionTransport } from '@kb-labs/core-contracts';
import type { BackendOptions, ExecutionBackend, ExecutionRequest, ExecuteOptions } from './types.js';
import { RemoteBackend } from './backends/remote.js';
import { createExecutionBackend } from './factory.js';

/**
 * Per-job context for both container provisioning and transport creation.
 * runtimeHostId is deterministic (derived from provisioningRunId), known before container starts.
 * namespaceId scopes the Gateway connection (used for JWT issuance and dispatch routing).
 */
export interface RemoteJobContext {
  /** Deterministic id the runtime server will register under (e.g. "runtime-abc123") */
  runtimeHostId: string;
  /** Tenant/namespace for Gateway routing and JWT */
  namespaceId: string;
}

/**
 * Options for container/remote execution.
 * Injected by loader.ts — transport factory + optional auto-provisioning.
 */
export interface StrictIsolationOptions {
  /**
   * Build an IExecutionTransport for a given job.
   * Called per-job in the RoutingBackend when target.environmentId is present.
   */
  buildTransport(ctx: RemoteJobContext): IExecutionTransport;

  /**
   * Absolute path on the host that maps to /workspace inside the container.
   * Used for handlerRef remapping: /host/abs/path → /workspace/rel/path.
   */
  workspaceRootOnHost?: string;

  /**
   * Auto-provision execution environment when target.environmentId is absent.
   * Encapsulates full lifecycle: workspace materialize → environment reserve/start →
   * workspace attach → [execute] → cleanup (release + destroy).
   *
   * Called by RoutingBackend for every execute() without pre-set environmentId.
   * Hosts never call adapters directly — execution plane handles everything.
   *
   * When target.environmentId IS present, this is skipped (explicit override).
   */
  provisionEnvironment?: (request: ExecutionRequest) => Promise<{
    environmentId: string;
    namespace: string;
    cleanup: () => Promise<void>;
  }>;
}

export interface IsolatedBackendOptions {
  /** BackendOptions for local execution (platform, mode, workerPool, etc.) */
  localBackend: BackendOptions;

  /**
   * When present, enables remote execution via RoutingBackend.
   * When absent, all requests go to the local backend.
   */
  strictIsolation?: StrictIsolationOptions;
}

/**
 * Create an execution backend suitable for any host.
 *
 * - Without strictIsolation: returns a plain local backend.
 * - With strictIsolation: returns a RoutingBackend that dispatches by environmentId,
 *   optionally auto-provisioning containers when environmentId is absent.
 *
 * Used by workflow-daemon, rest-api, webhook hosts — identical call site for all.
 */
export function createIsolatedExecutionBackend(options: IsolatedBackendOptions): ExecutionBackend {
  const localBackend = createExecutionBackend(options.localBackend);

  if (!options.strictIsolation) {
    return localBackend;
  }

  const { buildTransport, workspaceRootOnHost, provisionEnvironment } = options.strictIsolation;

  return buildRoutingBackend(
    localBackend,
    (ctx) => new RemoteBackend({
      transport: buildTransport(ctx),
      workspaceRootOnHost,
    }),
    provisionEnvironment,
  );
}

/**
 * Wrap a local backend with per-job routing + optional auto-provisioning:
 *
 *   target.environmentId present  → remote directly (explicit override / pre-provisioned)
 *   target.environmentId absent   → provisionEnvironment() if available (auto-provision)
 *   provisionEnvironment absent   → localBackend (in-process / worker-pool)
 *
 * The remote backend is created fresh per-job (each job = its own container).
 */
function buildRoutingBackend(
  localBackend: ExecutionBackend,
  remoteFactory: (ctx: RemoteJobContext) => ExecutionBackend,
  provisionEnvironment?: StrictIsolationOptions['provisionEnvironment'],
): ExecutionBackend {
  return {
    async execute(request: ExecutionRequest, execOptions?: ExecuteOptions) {
      let runtimeHostId = request.target?.environmentId;
      let namespaceId = request.target?.namespace ?? 'default';
      let cleanup: (() => Promise<void>) | undefined;

      // Auto-provision when no environmentId pre-set (REST API, CLI, etc.)
      // Skip when environmentId already present (explicit override, pre-warmed pool)
      if (!runtimeHostId && provisionEnvironment) {
        const provisioned = await provisionEnvironment(request);
        runtimeHostId = provisioned.environmentId;
        namespaceId = provisioned.namespace;
        cleanup = provisioned.cleanup;
      }

      if (runtimeHostId) {
        const ctx: RemoteJobContext = { runtimeHostId, namespaceId };
        try {
          return await remoteFactory(ctx).execute(request, execOptions);
        } finally {
          await cleanup?.();
        }
      }

      return localBackend.execute(request, execOptions);
    },
    health: () => localBackend.health(),
    stats: () => localBackend.stats(),
    shutdown: async () => localBackend.shutdown(),
  };
}
