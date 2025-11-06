/**
 * @module @kb-labs/plugin-runtime/validation/handler-parser
 * Parse handler reference from string or object format
 */

import type { HandlerRef } from '../types.js';

/**
 * Parse handlerRef from string format (e.g., './rest/review.js#handle')
 * @param handlerRef - Handler reference string or object
 * @returns HandlerRef object
 */
export function parseHandlerRef(handlerRef: string | HandlerRef): HandlerRef {
  if (typeof handlerRef === 'object') {
    return handlerRef;
  }
  const [file, exportName] = handlerRef.split('#');
  if (!exportName || !file) {
    throw new Error(`Handler reference must include export name: ${handlerRef}`);
  }
  return { file, export: exportName };
}

