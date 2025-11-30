/**
 * @module @kb-labs/plugin-runtime/sandbox/runner
 * Sandbox runner interface
 */

import type {
  ExecutionContext,
  ExecuteResult,
  HandlerRef,
} from '../types';
import type { PermissionSpec, ManifestV2 } from '@kb-labs/plugin-manifest';
import type { InvokeBroker } from '../invoke/broker';
import type { ArtifactBroker } from '../artifacts/broker';
import type { ShellBroker } from '../shell/broker';

/**
 * Sandbox runner - executes handlers in isolated environment
 */
export interface SandboxRunner {
  /**
   * Run handler in sandbox
   * @param args - Execution parameters
   * @returns Execution result (success or error)
   */
  run(args: {
    /** Execution context */
    ctx: ExecutionContext;
    /** Resolved permissions */
    perms: PermissionSpec;
    /** Handler reference */
    handler: HandlerRef;
    /** Input data */
    input: unknown;
    /** Plugin manifest */
    manifest: ManifestV2;
    /** Invoke broker for cross-plugin calls */
    invokeBroker?: InvokeBroker;
    /** Artifact broker for artifact access */
    artifactBroker?: ArtifactBroker;
    /** Shell broker for command execution */
    shellBroker?: ShellBroker;
  }): Promise<ExecuteResult>;
}

