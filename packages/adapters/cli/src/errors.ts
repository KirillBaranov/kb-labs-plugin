/**
 * @module @kb-labs/plugin-adapter-cli/errors
 * Error handling and mapping
 */

import type { PluginErrorEnvelope } from '@kb-labs/api-contracts';
import type { CliContext } from '@kb-labs/cli-core';

/**
 * Print error envelope to stderr
 */
export function printErrorEnvelope(
  envelope: PluginErrorEnvelope,
  context: CliContext
): void {
  const { code, message, details, meta } = envelope;

  // Print main error message
  context.presenter.error(`${code}: ${message}`);

  // Print details if available
  if (details) {
    context.presenter.error(`Details: ${JSON.stringify(details, null, 2)}`);
  }

  // Print meta information
  if (meta) {
    context.presenter.error(`Plugin: ${meta.pluginId}@${meta.pluginVersion}`);
    context.presenter.error(`Route/Command: ${meta.routeOrCommand}`);
    context.presenter.error(`Execution time: ${meta.timeMs}ms`);
    if (meta.cpuMs) {
      context.presenter.error(`CPU time: ${meta.cpuMs}ms`);
    }
    if (meta.memMb) {
      context.presenter.error(`Memory: ${meta.memMb.toFixed(2)}MB`);
    }

    // Print permission diff if available
    if (meta.perms && typeof meta.perms === 'object' && 'required' in meta.perms && 'granted' in meta.perms) {
      const perms = meta.perms as any;
      context.presenter.error(`Permissions:`);
      if (Array.isArray(perms.required)) {
        context.presenter.error(`  Required: ${perms.required.join(', ')}`);
      }
      if (Array.isArray(perms.granted)) {
        context.presenter.error(`  Granted: ${perms.granted.join(', ')}`);
      }
    }
  }

  // Print trace if available
  if (envelope.trace) {
    context.presenter.error(`Trace: ${envelope.trace}`);
  }
}

/**
 * Map error to exit code based on policy
 */
export function mapErrorToExitCode(
  error: PluginErrorEnvelope,
  policy: 'none' | 'major' | 'critical' = 'major'
): number {
  if (policy === 'none') {
    return 0;
  }

  const httpCode = error.http;
  const errorCode = error.code;

  // Critical errors (5xx)
  if (httpCode >= 500) {
    return policy === 'critical' ? 2 : 1;
  }

  // Permission denied, capability missing (403, 401)
  if (httpCode === 403 || httpCode === 401) {
    if (errorCode.includes('PERMISSION') || errorCode.includes('CAPABILITY')) {
      return policy === 'critical' ? 2 : 1;
    }
  }

  // Validation errors (400)
  if (httpCode === 400) {
    return policy === 'major' || policy === 'critical' ? 1 : 0;
  }

  // Default: major = 1, critical = 2, none = 0
  return policy === 'critical' ? 2 : policy === 'major' ? 1 : 0;
}
