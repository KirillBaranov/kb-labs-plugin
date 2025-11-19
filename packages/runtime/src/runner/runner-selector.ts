/**
 * @module @kb-labs/plugin-runtime/runner/runner-selector
 * Select appropriate sandbox runner based on context
 */

import type { ExecutionContext } from '../types.js';

export type RunnerMode = 'inprocess' | 'subprocess';

/**
 * Select runner mode based on execution context
 * @param ctx - Execution context
 * @returns Runner mode and whether to use dev mode
 */
export function selectRunnerMode(ctx: ExecutionContext): {
  mode: RunnerMode;
  devMode: boolean;
} {
  // Extract debugLevel from context
  const debugLevel = ctx.debugLevel || (ctx.debug ? 'verbose' : undefined);
  
  // For inspect mode, we MUST use subprocess (Node.js debugger requires separate process)
  const needsSubprocess = debugLevel === 'inspect';
  // For other debug modes, use inprocess for faster iteration
  const useInprocess = Boolean(ctx.debug && !needsSubprocess);
  
  const mode: RunnerMode = needsSubprocess ? 'subprocess' : (useInprocess ? 'inprocess' : 'subprocess');
  
  return {
    mode,
    devMode: useInprocess, // true only for verbose/simple debug, not for inspect
  };
}

