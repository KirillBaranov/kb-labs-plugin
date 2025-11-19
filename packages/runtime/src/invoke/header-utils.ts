/**
 * @module @kb-labs/plugin-runtime/invoke/header-utils
 * Helpers for merging trace headers and normalizing names.
 */

const TRACE_HEADERS = new Set(['traceparent', 'tracestate', 'x-request-id', 'x-trace-id']);

export function mergeHeaders(
  target: Record<string, string>,
  additions: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = { ...target };
  for (const [key, value] of Object.entries(additions)) {
    if (result[key] === undefined) {
      result[key] = value;
    }
  }
  return result;
}

export function mergeTraceHeaders(
  target: Record<string, string>,
  source: Record<string, string>
): Record<string, string> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (TRACE_HEADERS.has(key.toLowerCase()) && result[key] === undefined) {
      result[key] = value;
    }
  }
  return result;
}

