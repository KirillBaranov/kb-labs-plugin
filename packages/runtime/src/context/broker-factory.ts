/**
 * @module @kb-labs/plugin-runtime/context/broker-factory
 * Create invoke and artifact brokers
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext } from '../types.js';
import type { PluginRegistry } from '../registry.js';
import type { InvokeBroker } from '../invoke/broker.js';
import type { ArtifactBroker } from '../artifacts/broker.js';
import type { ChainLimits, InvokeContext } from '../invoke/types.js';
import { InvokeBroker as InvokeBrokerImpl } from '../invoke/broker.js';
import { ArtifactBroker as ArtifactBrokerImpl } from '../artifacts/broker.js';

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

