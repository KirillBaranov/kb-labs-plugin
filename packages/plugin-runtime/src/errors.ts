/**
 * @module @kb-labs/plugin-runtime/errors
 * Error-to-ErrorEnvelope mapping
 */

import { ErrorCode } from '@kb-labs/rest-api-contracts';
import type { ExecutionContext, ErrorEnvelope, ExecMetrics, PermissionSpecSummary, ErrorContext } from './types';
import type { PermissionSpec } from '@kb-labs/plugin-manifest';
import { analyzeRootCauseSync } from './errors/root-cause';
import { validateExecutionContext } from './context/context-validator';
import type { PluginContextV2 } from './context/plugin-context-v2';

// Re-export root cause types
export type { RootCauseAnalysis, RootCauseType } from './errors/root-cause';
export { analyzeRootCause, analyzeRootCauseSync } from './errors/root-cause';

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
 * Helper to determine if context is PluginContextV2
 */
function isPluginContextV2(ctx: ExecutionContext | PluginContextV2): ctx is PluginContextV2 {
  // PluginContextV2 has 'host' field, ExecutionContext has 'workdir' field
  return 'host' in ctx && !('workdir' in ctx);
}

/**
 * Helper to extract fields from either ExecutionContext or PluginContextV2
 */
function extractContextFields(ctx: ExecutionContext | PluginContextV2) {
  if (isPluginContextV2(ctx)) {
    return {
      requestId: ctx.requestId,
      pluginId: ctx.pluginId,
      pluginVersion: ctx.pluginVersion,
      routeOrCommand: (ctx.metadata?.routeOrCommand as string | undefined) || 'unknown',
      debug: (ctx.metadata?.debug as boolean | undefined) || false,
      debugLevel: (ctx.metadata?.debugLevel as 'verbose' | 'inspect' | 'profile' | undefined),
    };
  } else {
    return {
      requestId: ctx.requestId,
      pluginId: ctx.pluginId,
      pluginVersion: ctx.pluginVersion,
      routeOrCommand: ctx.routeOrCommand,
      debug: ctx.debug || false,
      debugLevel: ctx.debugLevel,
    };
  }
}

/**
 * Extract error context from execution context
 */
function extractErrorContext(
  ctx: ExecutionContext | PluginContextV2,
  error?: Error | unknown
): ErrorContext | undefined {
  // Get validation result to find missing properties (only for ExecutionContext)
  const validation = isPluginContextV2(ctx)
    ? { errors: [] } // PluginContextV2 doesn't need validation here
    : validateExecutionContext(ctx);
  const missingProperties = validation.errors.map((e) => e.field);
  const availableProperties = Object.keys(ctx as unknown as Record<string, unknown>).filter(
    (key) => (ctx as unknown as Record<string, unknown>)[key] !== undefined
  );

  // Extract location from error stack if available
  let location: ErrorContext['location'] = {};
  if (error instanceof Error && error.stack) {
    const stackMatch = error.stack.match(/at\s+(\w+)\s+\(([^:]+):(\d+):(\d+)\)/);
    if (stackMatch && stackMatch[3]) {
      location = {
        function: stackMatch[1],
        file: stackMatch[2],
        line: parseInt(stackMatch[3], 10),
      };
    } else {
      const fileMatch = error.stack.match(/([^:]+):(\d+):(\d+)/);
      if (fileMatch && fileMatch[2]) {
        location = {
          file: fileMatch[1],
          line: parseInt(fileMatch[2], 10),
        };
      }
    }

    // Try to extract property name from error message
    const propertyMatch = error.message.match(/'(.*?)'/);
    if (propertyMatch) {
      location.property = propertyMatch[1];
    }
  }

  // Extract fields using helper (handles both context types)
  const fields = extractContextFields(ctx);

  // Create context snapshot (safe, no functions)
  const contextSnapshot: Record<string, unknown> = {
    pluginId: fields.pluginId,
    pluginVersion: fields.pluginVersion,
    routeOrCommand: fields.routeOrCommand,
    // Add metadata fields if available
    ...(isPluginContextV2(ctx) ? {
      host: ctx.host,
      cwd: ctx.cwd,
      outdir: ctx.outdir,
      debug: fields.debug,
      debugLevel: fields.debugLevel,
      traceId: (ctx.metadata?.traceId as string | undefined),
      spanId: (ctx.metadata?.spanId as string | undefined),
    } : {
      workdir: (ctx as ExecutionContext).workdir,
      pluginRoot: (ctx as ExecutionContext).pluginRoot,
      debug: (ctx as ExecutionContext).debug,
      debugLevel: (ctx as ExecutionContext).debugLevel,
      jsonMode: (ctx as ExecutionContext).jsonMode,
      traceId: (ctx as ExecutionContext).traceId,
      spanId: (ctx as ExecutionContext).spanId,
    }),
  };

  return {
    location,
    availableProperties,
    missingProperties,
    contextSnapshot,
  };
}

/**
 * Generate documentation URL for error code
 */
function getDocumentationUrl(code: string): string | undefined {
  const baseUrl = 'https://kb-labs.dev/docs/errors';
  const codeMap: Record<string, string> = {
    [ErrorCode.PLUGIN_PERMISSION_DENIED]: `${baseUrl}/permission-denied`,
    [ErrorCode.PLUGIN_CAPABILITY_MISSING]: `${baseUrl}/capability-missing`,
    [ErrorCode.PLUGIN_HANDLER_NOT_FOUND]: `${baseUrl}/handler-not-found`,
    [ErrorCode.PLUGIN_TIMEOUT]: `${baseUrl}/timeout`,
    [ErrorCode.PLUGIN_SCHEMA_VALIDATION_FAILED]: `${baseUrl}/validation-failed`,
    [ErrorCode.PLUGIN_ARTIFACT_FAILED]: `${baseUrl}/artifact-failed`,
    [ErrorCode.PLUGIN_QUOTA_EXCEEDED]: `${baseUrl}/quota-exceeded`,
  };
  return codeMap[code];
}

/**
 * Convert error to ErrorEnvelope
 * @param code - Error code
 * @param http - HTTP status code (auto-mapped if not provided)
 * @param details - Error details (will be sanitized)
 * @param ctx - Execution context (ExecutionContext or PluginContextV2)
 * @param metrics - Execution metrics
 * @param perms - Permissions (optional, for summary)
 * @param originalError - Original error object (optional, for root cause analysis)
 * @returns ErrorEnvelope
 */
export function toErrorEnvelope(
  code: string,
  http: number | undefined,
  details: Record<string, unknown>,
  ctx: ExecutionContext | PluginContextV2,
  metrics: ExecMetrics,
  perms?: PermissionSpec,
  originalError?: Error | unknown
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

  // Extract stack trace if available
  const trace =
    originalError instanceof Error
      ? originalError.stack
      : sanitizedDetails.trace as string | undefined;

  // Extract fields from context (handles both ExecutionContext and PluginContextV2)
  const fields = extractContextFields(ctx);

  // Analyze root cause if error is available and debug mode is enabled
  // Use sync version to avoid making toErrorEnvelope async
  // History will be loaded separately if needed via async analyzeRootCause
  const rootCause =
    (fields.debug || fields.debugLevel) && originalError
      ? analyzeRootCauseSync(
          originalError,
          ctx as unknown as Record<string, unknown>,
          trace
        )
      : undefined;

  // Extract error context
  const errorContext = extractErrorContext(ctx, originalError);

  // Generate suggestions and fixes from root cause
  const suggestions = rootCause
    ? rootCause.suggestedFixes.map((f) => f.description)
    : undefined;
  const fixes = rootCause
    ? rootCause.suggestedFixes.map((f) => ({
        description: f.description,
        code: f.code,
        autoApplicable: f.autoApplicable,
      }))
    : undefined;

  // Get documentation URL
  const documentation = getDocumentationUrl(code);

  return {
    status: 'error',
    http: httpStatus,
    code,
    message,
    details: sanitizedDetails,
    trace,
    rootCause,
    context: errorContext,
    suggestions,
    fixes,
    documentation,
    meta: {
      requestId: fields.requestId,
      pluginId: fields.pluginId,
      pluginVersion: fields.pluginVersion,
      routeOrCommand: fields.routeOrCommand,
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

