/**
 * @module @kb-labs/plugin-runtime/runner/runner-config
 * Create sandbox runner configuration
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecuteInput } from '../types';
import type { SandboxConfig } from '@kb-labs/core-sandbox';
import { selectRunnerMode } from './runner-selector';
import type { ExecutionContext } from '../types';

/**
 * Create sandbox runner configuration
 */
export function createRunnerConfig(
  args: ExecuteInput,
  ctx: ExecutionContext
): SandboxConfig {
  const { mode, devMode } = selectRunnerMode(ctx);
  
  return {
    execution: {
      timeoutMs: args.perms.quotas?.timeoutMs ?? 60000,
      graceMs: 5000,
      memoryMb: args.perms.quotas?.memoryMb ?? 512,
    },
    permissions: {
      env: { allow: args.perms.env?.allow || [] },
      filesystem: { allow: [], deny: [], readOnly: false },
      network: { allow: [], deny: [] },
      capabilities: args.perms.capabilities || [],
    },
    monitoring: {
      // Always collect logs (for error display even without --debug)
      // But only stream in real-time when debug is enabled
      collectLogs: true,
      collectMetrics: true,
      collectTraces: true,
      logBufferSizeMb: 1, // ~50 lines buffer
    },
    mode,
    devMode,
  };
}

