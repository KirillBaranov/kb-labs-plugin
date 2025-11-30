/**
 * @module @kb-labs/plugin-runtime/context/context-builder
 * Build execution context with trace info and chain limits
 */

import type { ExecutionContext } from '../types';
import type { ChainLimits, InvokeContext } from '../invoke/types';
import { createId } from '../utils';
import { mergeTraceHeaders } from '../invoke/header-utils';
import { CURRENT_CONTEXT_VERSION } from '@kb-labs/core-sandbox';
import type { ResourceTracker } from '@kb-labs/core-sandbox';

/**
 * Initialize chain limits from context or defaults
 */
export function initializeChainLimits(
  ctx: ExecutionContext,
  defaultTimeoutMs: number
): ChainLimits {
  return ctx.chainLimits || {
    maxDepth: 8,
    maxFanOut: 16,
    maxChainTime: defaultTimeoutMs,
  };
}

/**
 * Initialize chain state from context or defaults
 */
export function initializeChainState(
  ctx: ExecutionContext,
  defaultTimeoutMs: number
): InvokeContext {
  return ctx.chainState || {
    depth: 0,
    fanOut: 0,
    visited: [],
    remainingMs: defaultTimeoutMs,
  };
}

/**
 * Create remainingMs calculator function
 */
export function createRemainingMsCalculator(
  startedAt: number,
  initialTimeoutMs: number
): () => number {
  return (): number => {
    const elapsed = Date.now() - startedAt;
    return Math.max(0, initialTimeoutMs - elapsed);
  };
}

/**
 * Build updated execution context with trace info and chain limits
 */
export function buildExecutionContext(
  ctx: ExecutionContext,
  chainLimits: ChainLimits,
  chainState: InvokeContext,
  remainingMs: () => number,
  analyticsEmitter: (event: any) => Promise<any>,
  resources: ResourceTracker,
  invokeBroker: any,
  artifactBroker: any,
  shellBroker?: any,
  stateAPI?: any
): ExecutionContext {
  // Ensure pluginRoot is preserved in updatedCtx (required)
  if (!ctx.pluginRoot) {
    throw new Error('pluginRoot is required in ExecutionContext');
  }
  
  const traceId = ctx.traceId || createId();
  const spanId = ctx.spanId || createId();
  
  return {
    ...ctx,
    version: ctx.version || CURRENT_CONTEXT_VERSION,
    traceId,
    spanId,
    parentSpanId: ctx.parentSpanId,
    chainLimits,
    chainState,
    remainingMs,
    analytics: analyticsEmitter,
    resources,
    // Explicitly preserve pluginRoot (required)
    pluginRoot: ctx.pluginRoot,
    // Preserve adapter context and metadata - MUST be explicitly set after spread
    adapterContext: ctx.adapterContext,
    adapterMeta: ctx.adapterMeta,
    // Add brokers to extensions
    extensions: {
      ...ctx.extensions,
      artifacts: artifactBroker,
      invoke: invokeBroker,
      shell: shellBroker,
      state: stateAPI,
      events: ctx.extensions?.events,
    },
    headers: ctx.headers
      ? {
          inbound: { ...ctx.headers.inbound },
          sensitive: ctx.headers.sensitive ? [...ctx.headers.sensitive] : undefined,
          rateLimitKeys: ctx.headers.rateLimitKeys
            ? { ...ctx.headers.rateLimitKeys }
            : undefined,
        }
      : undefined,
    // Preserve hooks
    hooks: ctx.hooks,
    // Preserve signal
    signal: ctx.signal,
  };
}

