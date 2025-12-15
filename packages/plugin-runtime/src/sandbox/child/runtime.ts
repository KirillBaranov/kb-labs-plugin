/**
 * @module @kb-labs/plugin-runtime/sandbox/child/runtime
 * Build safe runtime context for handlers
 */

import type { PermissionSpec, ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext, FSLike, PluginAPI, PluginOutput } from '../../types';
import type { InvokeBroker } from '../../invoke/broker';
import type { ArtifactBroker } from '../../artifacts/broker';
import type { ShellBroker } from '../../shell/broker';
import type { JobBroker } from '../../jobs/broker';
import type { StateBroker } from '@kb-labs/core-state-broker';
import type { EventBus } from '../../events/index';
import { createWhitelistedFetch } from '../../io/net';
import { createFsShim } from '../../io/fs';
import { createEnvAccessor } from '../../io/env';
import { createStateAPI } from '../../io/state';
import { createPluginAPI, createPluginOutput } from '../../context-factories';

/**
 * Runtime result - clean API surface for handlers
 */
export interface BuildRuntimeResult {
  /** Plugin API - invoke, state, artifacts, shell, events */
  api: PluginAPI;
  /** Output API - logging and presentation */
  output: PluginOutput;
  /** Core runtime - fs, fetch, env (sandboxed) */
  runtime: {
    fs: FSLike;
    fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
    env: (key: string) => string | undefined;
  };
}

/**
 * Build safe runtime context for handler execution
 *
 * @param perms - Resolved permissions
 * @param ctx - Execution context
 * @param env - Filtered environment (already whitelisted)
 * @param manifest - Plugin manifest
 * @param invokeBroker - Invoke broker for cross-plugin calls
 * @param artifactBroker - Artifact broker for artifact access
 * @param shellBroker - Shell broker for command execution
 * @param stateBroker - State broker for persistent state
 * @param jobBroker - Job broker for background jobs
 * @param eventBus - Event bus for pub/sub
 */
export function buildRuntime(
  perms: PermissionSpec,
  ctx: ExecutionContext,
  env: NodeJS.ProcessEnv,
  manifest: ManifestV2,
  invokeBroker?: InvokeBroker,
  artifactBroker?: ArtifactBroker,
  shellBroker?: ShellBroker,
  stateBroker?: StateBroker,
  jobBroker?: JobBroker,
  eventBus?: EventBus
): BuildRuntimeResult {
  // === CORE RUNTIME (sandboxed) ===
  const fs = createFsShim(perms.fs, ctx.workdir, ctx.outdir, ctx);
  const fetch = createWhitelistedFetch(perms.net, globalThis.fetch, ctx);
  const envAccessor = createEnvAccessor(perms.env?.allow, env);

  // === STATE API ===
  const state = stateBroker && perms.state
    ? createStateAPI(stateBroker, ctx.pluginId, perms.state)
    : undefined;

  // === LOGGING ===
  const log = (
    level: 'debug' | 'info' | 'warn' | 'error',
    msg: string,
    meta?: Record<string, unknown>
  ): void => {
    // Send via IPC for subprocess communication
    if (process.send) {
      process.send({
        type: 'LOG',
        payload: { level, message: msg, meta, timestamp: Date.now() },
      });
    }

    // Also use unified logging system
    try {
      const { getLogger } = require('@kb-labs/core-sys/logging');
      const logger = getLogger(`runtime:plugin:${ctx.pluginId || 'unknown'}`).child({
        meta: {
          layer: 'runtime',
          reqId: ctx.requestId,
          traceId: ctx.traceId,
          spanId: ctx.spanId,
          pluginId: ctx.pluginId,
          ...meta,
        },
      });
      logger[level](msg, meta);
    } catch {
      // Fallback to IPC only
    }
  };

  const logger = {
    debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
    info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
    warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
  };

  // === ANALYTICS ===
  const analytics = ctx.analytics
    ? async (event: Partial<import('@kb-labs/core-types').TelemetryEvent>) => ctx.analytics!(event)
    : undefined;

  // === BUILD API ===
  const api = createPluginAPI({
    invokeBroker,
    stateBroker: state,
    artifactBroker,
    shellBroker,
    eventBus,
    jobBroker,
    analytics,
  });

  const output = createPluginOutput({
    logger,
    presenter: undefined, // Not available in subprocess
  });

  return {
    api,
    output,
    runtime: {
      fs,
      fetch,
      env: envAccessor,
    },
  };
}
