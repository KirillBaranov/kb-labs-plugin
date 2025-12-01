/**
 * @module @kb-labs/plugin-runtime/context/broker-factory
 * Create invoke and artifact brokers
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext } from '../types';
import type { PluginRegistry } from '../registry';
import type { InvokeBroker } from '../invoke/broker';
import type { ArtifactBroker } from '../artifacts/broker';
import type { ShellBroker } from '../shell/broker';
import type { JobBroker } from '../jobs/broker';
import type { PresenterFacade } from './plugin-context';

// These will be provided by workflow-engine
type CronScheduler = any;
type DegradationController = any;
import type { ChainLimits, InvokeContext } from '../invoke/types';
import { InvokeBroker as InvokeBrokerImpl } from '../invoke/broker';
import { ArtifactBroker as ArtifactBrokerImpl } from '../artifacts/broker';
import { ShellBroker as ShellBrokerImpl } from '../shell/broker';
import { JobBroker as JobBrokerImpl } from '../jobs/broker';
import { CapabilityFlag } from './capabilities';

/**
 * Create artifact broker
 */
export function createArtifactBroker(
  manifest: ManifestV2,
  ctx: ExecutionContext,
  registry?: PluginRegistry,
  artifactBaseDir?: string
): ArtifactBroker {
  const baseDir = artifactBaseDir || ctx.outdir || ctx.workdir;
  return new ArtifactBrokerImpl(
    manifest,
    ctx,
    registry, // registry is optional - only needed for cross-plugin artifact access
    baseDir // Use outdir or workdir as base for artifacts
  );
}

/**
 * Create invoke broker (only if registry is provided)
 */
export function createInvokeBroker(
  registry: PluginRegistry,
  manifest: ManifestV2,
  ctx: ExecutionContext,
  chainLimits: ChainLimits,
  chainState: InvokeContext
): InvokeBroker | undefined {
  if (!registry) {
    return undefined;
  }
  
  return new InvokeBrokerImpl(
    registry,
    manifest,
    ctx,
    chainLimits,
    chainState
  );
}

/**
 * Create shell broker (only if shell permissions are declared and capability is granted)
 */
export function createShellBroker(
  manifest: ManifestV2,
  ctx: ExecutionContext,
  presenter?: PresenterFacade,
  grantedCapabilities?: string[]
): ShellBroker | undefined {
  const shellPerms = manifest.permissions?.shell;
  if (!shellPerms) {
    return undefined;
  }
  
  // Check capability (deny-by-default)
  if (grantedCapabilities) {
    const hasShellCapability = grantedCapabilities.includes(CapabilityFlag.ShellExec);
    if (!hasShellCapability) {
      return undefined;
    }
  }
  
  return new ShellBrokerImpl(manifest, ctx, presenter);
}

/**
 * Create job broker (only if job permissions are declared and workflow engine is available)
 */
export function createJobBroker(
  manifest: ManifestV2,
  ctx: ExecutionContext,
  workflowEngine?: any, // TODO: Type as WorkflowEngine once we have proper integration
  cronScheduler?: CronScheduler,
  degradationController?: DegradationController
): JobBroker | undefined {
  const jobPerms = manifest.permissions?.jobs;
  if (!jobPerms) {
    return undefined;
  }

  // WorkflowEngine is required
  if (!workflowEngine) {
    return undefined;
  }

  return new JobBrokerImpl(
    workflowEngine,
    manifest,
    ctx,
    cronScheduler,
    degradationController
  );
}


