/**
 * @module @kb-labs/plugin-runtime/sandbox/child/runtime
 * Build safe runtime context for handlers
 */

import type { PermissionSpec, ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext, FSLike } from '../../types.js';
import type { InvokeBroker } from '../../invoke/broker.js';
import type { ArtifactBroker } from '../../artifacts/broker.js';
import { createWhitelistedFetch } from '../../io/net.js';
import { createFsShim } from '../../io/fs.js';
import { createEnvAccessor } from '../../io/env.js';

/**
 * Build safe runtime context for handler execution
 * @param perms - Resolved permissions
 * @param ctx - Execution context
 * @param env - Filtered environment (already whitelisted)
 * @param manifest - Plugin manifest
 * @param invokeBroker - Invoke broker for cross-plugin calls
 * @param artifactBroker - Artifact broker for artifact access
 * @returns Runtime context with shimmed APIs
 */
export function buildRuntime(
  perms: PermissionSpec,
  ctx: ExecutionContext,
  env: NodeJS.ProcessEnv,
  manifest: ManifestV2,
  invokeBroker?: InvokeBroker,
  artifactBroker?: ArtifactBroker
): {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  fs: FSLike;
  env: (key: string) => string | undefined;
  log: (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ) => void;
  invoke: <T = unknown>(
    request: import('../../invoke/types.js').InvokeRequest
  ) => Promise<import('../../invoke/types.js').InvokeResult<T>>;
  artifacts: {
    read: (
      request: import('../../artifacts/broker.js').ArtifactReadRequest
    ) => Promise<Buffer | object>;
    write: (
      request: import('../../artifacts/broker.js').ArtifactWriteRequest
    ) => Promise<{
      path: string;
      meta: import('../../artifacts/broker.js').ArtifactMeta;
    }>;
  };
  analytics?: (event: Partial<import('@kb-labs/analytics-sdk-node').AnalyticsEventV1>) => Promise<import('@kb-labs/analytics-sdk-node').EmitResult>;
} {
  // Build network fetch (with whitelisting and dry-run support)
  const fetch = createWhitelistedFetch(perms.net, globalThis.fetch, ctx);

  // Build FS shim (with permission checks)
  const fs = createFsShim(perms.fs, ctx.workdir, ctx.outdir, ctx);

  // Build env accessor
  const envAccessor = createEnvAccessor(perms.env?.allow, env);

  // Build log function (sends via IPC)
  const log = (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ): void => {
    if (process.send) {
      process.send({
        type: 'LOG',
        payload: {
          level,
          message: msg,
          meta,
          timestamp: Date.now(),
        },
      });
    }
  };

  // Build invoke function
  const invoke = async <T = unknown>(
    request: import('../../invoke/types.js').InvokeRequest
  ): Promise<import('../../invoke/types.js').InvokeResult<T>> => {
    if (!invokeBroker) {
      throw new Error('Invoke broker not available in this context');
    }
    return invokeBroker.invoke<T>(request);
  };

  // Build artifacts API
  const artifacts = {
    read: async (
      request: import('../../artifacts/broker.js').ArtifactReadRequest
    ): Promise<Buffer | object> => {
      if (!artifactBroker) {
        throw new Error('Artifact broker not available in this context');
      }
      return artifactBroker.read(request);
    },
    write: async (
      request: import('../../artifacts/broker.js').ArtifactWriteRequest
    ): Promise<{
      path: string;
      meta: import('../../artifacts/broker.js').ArtifactMeta;
    }> => {
      if (!artifactBroker) {
        throw new Error('Artifact broker not available in this context');
      }
      return artifactBroker.write(request);
    },
  };

  // Build analytics emitter (if available in context)
  const analytics = ctx.analytics
    ? async (event: Partial<import('@kb-labs/analytics-sdk-node').AnalyticsEventV1>) => {
        return ctx.analytics!(event);
      }
    : undefined;

  return {
    fetch,
    fs,
    env: envAccessor,
    log,
    invoke,
    artifacts,
    analytics,
  };
}

