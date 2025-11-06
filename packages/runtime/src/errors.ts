/**
 * @module @kb-labs/plugin-runtime/errors
 * Error-to-ErrorEnvelope mapping
 */

import { ErrorCode } from '@kb-labs/api-contracts';
import type { ExecutionContext, ErrorEnvelope, ExecMetrics, PermissionSpecSummary } from './types.js';
import type { PermissionSpec } from '@kb-labs/plugin-manifest';

/**
 * Map error code to HTTP status
 */
function errorCodeToHttp(code: string): number {
  switch (code) {
    case ErrorCode.PLUGIN_PERMISSION_DENIED:
      return 403;
    case ErrorCode.PLUGIN_CAPABILITY_MISSING:
      return 403;
    case ErrorCode.PLUGIN_HANDLER_NOT_FOUND:
      return 500;
    case ErrorCode.PLUGIN_TIMEOUT:
      return 504;
    case ErrorCode.PLUGIN_SCHEMA_VALIDATION_FAILED:
      return 422;
    case ErrorCode.PLUGIN_ARTIFACT_FAILED:
      return 500;
    case ErrorCode.PLUGIN_QUOTA_EXCEEDED:
      return 429;
    default:
      return 500;
  }
}

/**
 * Create permission spec summary (no secrets)
 */
function createPermissionSpecSummary(
  perms: PermissionSpec | undefined
): PermissionSpecSummary | undefined {
  if (!perms) {
    return undefined;
  }

  return {
    fs: perms.fs
      ? {
          mode: perms.fs.mode,
          allowCount: perms.fs.allow?.length,
          denyCount: perms.fs.deny?.length,
        }
      : undefined,
    net:
      perms.net === 'none'
        ? 'none'
        : perms.net
          ? {
              allowHostsCount: perms.net.allowHosts?.length,
              denyHostsCount: perms.net.denyHosts?.length,
            }
          : undefined,
    env: perms.env
      ? {
          allowCount: perms.env.allow?.length,
        }
      : undefined,
    quotas: perms.quotas,
    capabilities: perms.capabilities,
  };
}

/**
 * Sanitize error details (remove secrets)
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const secretKeys = ['password', 'secret', 'token', 'key', 'apiKey', 'auth'];

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (secretKeys.some((secret) => lowerKey.includes(secret))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Convert error to ErrorEnvelope
 * @param code - Error code
 * @param http - HTTP status code (auto-mapped if not provided)
 * @param details - Error details (will be sanitized)
 * @param ctx - Execution context
 * @param metrics - Execution metrics
 * @param perms - Permissions (optional, for summary)
 * @returns ErrorEnvelope
 */
export function toErrorEnvelope(
  code: string,
  http: number | undefined,
  details: Record<string, unknown>,
  ctx: ExecutionContext,
  metrics: ExecMetrics,
  perms?: PermissionSpec
): ErrorEnvelope {
  const httpStatus = http ?? errorCodeToHttp(code);
  const sanitizedDetails = sanitizeDetails(details);

  // Build message from details
  let message = sanitizedDetails.message as string;
  if (!message) {
    // Generate message from code
    switch (code) {
      case ErrorCode.PLUGIN_PERMISSION_DENIED:
        message = 'Plugin permission denied';
        break;
      case ErrorCode.PLUGIN_CAPABILITY_MISSING:
        message = 'Plugin capability missing';
        break;
      case ErrorCode.PLUGIN_HANDLER_NOT_FOUND:
        message = 'Plugin handler not found';
        break;
      case ErrorCode.PLUGIN_TIMEOUT:
        message = 'Plugin execution timeout';
        break;
      case ErrorCode.PLUGIN_SCHEMA_VALIDATION_FAILED:
        message = 'Plugin schema validation failed';
        break;
      case ErrorCode.PLUGIN_ARTIFACT_FAILED:
        message = 'Plugin artifact write failed';
        break;
      case ErrorCode.PLUGIN_QUOTA_EXCEEDED:
        message = 'Plugin quota exceeded';
        break;
      default:
        message = 'Plugin execution error';
    }
  }

  return {
    status: 'error',
    http: httpStatus,
    code,
    message,
    details: sanitizedDetails,
    trace: undefined, // Will be set if safe and source maps available
    meta: {
      requestId: ctx.requestId,
      pluginId: ctx.pluginId,
      pluginVersion: ctx.pluginVersion,
      routeOrCommand: ctx.routeOrCommand,
      timeMs: metrics.timeMs,
      cpuMs: metrics.cpuMs,
      memMb: metrics.memMb,
      perms: perms ? createPermissionSpecSummary(perms) : undefined,
    },
  };
}

/**
 * Create structured error context with remediation hints
 */
export function createErrorContext(
  code: string,
  attemptedAction: string,
  attemptedPath?: string,
  currentPermission?: string
): Record<string, unknown> {
  const context: Record<string, unknown> = {
    attemptedAction,
  };

  if (attemptedPath) {
    context.attemptedPath = attemptedPath;
  }

  if (currentPermission) {
    context.currentPermission = currentPermission;
  }

  // Add remediation hints
  switch (code) {
    case ErrorCode.PLUGIN_PERMISSION_DENIED:
      if (attemptedAction === 'fs.read' || attemptedAction === 'fs.write') {
        context.remediation =
          `Add "${attemptedPath}" to permissions.fs.allow in manifest, or change to readWrite mode`;
      } else if (attemptedAction === 'net.fetch') {
        context.remediation =
          `Add host to permissions.net.allowHosts in manifest`;
      }
      break;
    case ErrorCode.PLUGIN_CAPABILITY_MISSING:
      context.remediation =
        'Request capability grant in plugin configuration or add to manifest capabilities';
      break;
  }

  return context;
}

