/**
 * @module @kb-labs/plugin-runtime/execute-plugin/loader
 * Handler module loading
 */

import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { HandlerRef } from '../types';

/**
 * Load handler function from module
 */
export async function loadHandler(
  handlerRef: HandlerRef,
  pluginRoot: string
): Promise<(...args: any[]) => Promise<unknown>> {
  // Resolve handler file path
  // pluginRoot should point to dist directory (compiled output)
  let handlerFilePath = handlerRef.file;

  // Add .js extension if not present (ESM requires extensions)
  if (!handlerFilePath.endsWith('.js') && !handlerFilePath.endsWith('.mjs')) {
    handlerFilePath += '.js';
  }

  const handlerPath = path.resolve(pluginRoot, handlerFilePath);

  // Convert to file URL for ESM import
  const handlerUrl = pathToFileURL(handlerPath).href;

  // Dynamic import
  const module = await import(handlerUrl);

  // Get export
  const handlerFn = module[handlerRef.export];

  if (typeof handlerFn !== 'function') {
    throw new Error(
      `Handler export "${handlerRef.export}" is not a function in ${handlerRef.file}`
    );
  }

  return handlerFn;
}
