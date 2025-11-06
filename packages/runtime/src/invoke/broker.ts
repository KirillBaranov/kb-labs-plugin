/**
 * @module @kb-labs/plugin-runtime/invoke/broker
 * Invoke broker for cross-plugin invocation
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext } from '../types.js';
import type { PluginRegistry } from '../registry.js';
import type {
  InvokeContext,
  InvokeRequest,
  InvokeResult,
  ChainLimits,
} from './types.js';
import { resolveInvokeDecision } from './permissions.js';
import { createId } from '../utils.js';
import { toErrorEnvelope } from '../errors.js';
import { ErrorCode } from '@kb-labs/api-contracts';
import { saveTrace, rotateTraces, type TraceData, type TraceSpan } from '../trace.js';

/**
 * Parse target string: "@pluginId@<semver>|latest:METHOD /path"
 * @param target - Target string
 * @returns Parsed target or null if invalid
 */
function parseTarget(target: string): {
  pluginId: string;
  version?: string;
  method: string;
  path: string;
} | null {
  // Format: @pluginId@version:METHOD /path or @pluginId@latest:METHOD /path
  const match = target.match(/^@([^@]+)@(latest|\d+\.\d+\.\d+[^:]*):(\w+)\s+(.+)$/);
  if (!match || !match[1] || !match[3] || !match[4]) {
    return null;
  }

  const pluginId = match[1];
  const versionSpec = match[2];
  const method = match[3];
  const path = match[4];
  const version = versionSpec === 'latest' ? undefined : versionSpec;

  return {
    pluginId,
    version,
    method: method.toUpperCase(),
    path,
  };
}

/**
 * Invoke broker for cross-plugin invocation
 * Handles permission checks, chain limits, and route resolution
 */
export class InvokeBroker {
  private chainDepth: number;
  private chainFanOut: number;
  private chainStartTime: number;
  private traceSpans: TraceSpan[] = [];
  private tracePlugins: Set<string> = new Set();
  private traceErrors: number = 0;

  constructor(
    private registry: PluginRegistry,
    private callerManifest: ManifestV2,
    private ctx: ExecutionContext,
    private chainLimits: ChainLimits,
    private chainState?: InvokeContext
  ) {
    // Initialize chain state from context or defaults
    this.chainDepth = chainState?.depth ?? 0;
    this.chainFanOut = chainState?.fanOut ?? 0;
    this.chainStartTime = Date.now();
    
    // Track root plugin
    if (ctx.pluginId) {
      this.tracePlugins.add(ctx.pluginId);
    }
  }

  /**
   * Invoke a plugin handler
   * @param request - Invoke request
   * @param context - Invoke context (for nested calls)
   * @returns Invoke result
   */
  async invoke(
    request: InvokeRequest,
    context?: InvokeContext
  ): Promise<InvokeResult<unknown>> {
    const startTime = Date.now();
    const spanId = createId();
    const parentSpanId = request.session?.parentSpanId || this.ctx.spanId;

    // Create span for tracking
    const span: TraceSpan = {
      id: spanId,
      traceId: this.ctx.traceId || createId(),
      parentSpanId,
      pluginId: '',
      routeOrCommand: '',
      method: undefined,
      path: undefined,
      startTime,
      status: 'pending',
    };

    try {
      // 1. Parse target
      const parsed = parseTarget(request.target);
      if (!parsed) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            'INVALID_TARGET',
            400,
            {
              target: request.target,
              expected: '@pluginId@version:METHOD /path or @pluginId@latest:METHOD /path',
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      const { pluginId, version, method, path } = parsed;
      
      // Update span with target info
      span.pluginId = pluginId;
      span.method = method;
      span.path = path;
      span.routeOrCommand = `${method} ${path}`;

      // 2. Check chain limits
      const currentDepth = context?.depth ?? this.chainDepth + 1;
      const currentFanOut = context?.fanOut ?? this.chainFanOut + 1;
      const elapsedTime = Date.now() - this.chainStartTime;
      const remainingMs = context?.remainingMs ?? this.ctx.remainingMs?.() ?? 0;

      if (currentDepth > this.chainLimits.maxDepth) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            ErrorCode.PLUGIN_QUOTA_EXCEEDED,
            429,
            {
              message: `Maximum chain depth (${this.chainLimits.maxDepth}) exceeded`,
              currentDepth,
              maxDepth: this.chainLimits.maxDepth,
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      if (currentFanOut > this.chainLimits.maxFanOut) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            ErrorCode.PLUGIN_QUOTA_EXCEEDED,
            429,
            {
              message: `Maximum fan-out (${this.chainLimits.maxFanOut}) exceeded`,
              currentFanOut,
              maxFanOut: this.chainLimits.maxFanOut,
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      if (elapsedTime > this.chainLimits.maxChainTime) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            ErrorCode.PLUGIN_QUOTA_EXCEEDED,
            429,
            {
              message: `Maximum chain time (${this.chainLimits.maxChainTime}ms) exceeded`,
              elapsedTime,
              maxChainTime: this.chainLimits.maxChainTime,
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      if (remainingMs <= 0) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            ErrorCode.PLUGIN_TIMEOUT,
            408,
            {
              message: 'Remaining timeout budget exhausted',
              remainingMs: 0,
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      // 3. Check for cycles
      const visited = context?.visited ?? [this.ctx.pluginId];
      if (visited.includes(pluginId)) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            'CYCLE_DETECTED',
            400,
            {
              message: `Circular invocation detected: ${visited.join(' -> ')} -> ${pluginId}`,
              visited,
              currentPlugin: pluginId,
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      // 4. Get target plugin manifest
      const targetManifest = await this.registry.getManifest(pluginId, version);
      if (!targetManifest) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            'PLUGIN_NOT_FOUND',
            404,
            {
              message: `Plugin ${pluginId}${version ? `@${version}` : ''} not found`,
              pluginId,
              version,
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      // 5. Check permissions
      const invokePerms = this.callerManifest.permissions?.invoke;
      const permissionResult = resolveInvokeDecision(invokePerms, {
        pluginId,
        method,
        path,
      });

      if (!permissionResult.allow) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            ErrorCode.PLUGIN_PERMISSION_DENIED,
            403,
            {
              message: `Permission denied: ${permissionResult.reason}`,
              target: request.target,
              reason: permissionResult.reason,
              remediation: permissionResult.remediation,
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      // 6. Resolve route
      const handlerRef = await this.registry.resolveRoute(pluginId, method, path);
      if (!handlerRef) {
        const timeMs = Date.now() - startTime;
        return {
          ok: false,
          error: toErrorEnvelope(
            ErrorCode.PLUGIN_HANDLER_NOT_FOUND,
            404,
            {
              message: `Route ${method} ${path} not found in plugin ${pluginId}`,
              pluginId,
              method,
              path,
            },
            this.ctx,
            { timeMs }
          ),
        };
      }

      // 7. TODO: Execute handler through registry
      // This would require calling the handler through the plugin runtime
      // For now, return a placeholder indicating the handler was resolved
      const timeMs = Date.now() - startTime;
      const endTime = Date.now();

      // Track span
      span.endTime = endTime;
      span.duration = timeMs;
      span.status = 'success';
      span.pluginVersion = targetManifest.version;
      this.traceSpans.push(span);
      this.tracePlugins.add(pluginId);

      return {
        ok: true,
        data: {
          message: 'Handler resolved successfully',
          handler: handlerRef,
          pluginId,
          method,
          path,
        },
        meta: {
          timeMs,
          spanId,
        },
      };
    } catch (error) {
      const timeMs = Date.now() - startTime;
      const endTime = Date.now();
      
      // Track error span
      span.endTime = endTime;
      span.duration = timeMs;
      span.status = 'error';
      span.error = {
        code: 'INVOKE_ERROR',
        message: error instanceof Error ? error.message : String(error),
      };
      this.traceSpans.push(span);
      this.traceErrors++;
      
      return {
        ok: false,
        error: toErrorEnvelope(
          'INVOKE_ERROR',
          500,
          {
            message: error instanceof Error ? error.message : String(error),
            target: request.target,
          },
          this.ctx,
          { timeMs }
        ),
      };
    }
  }

  /**
   * Save trace to disk (should be called after all invocations complete)
   */
  async saveTrace(): Promise<string | null> {
    if (this.traceSpans.length === 0) {
      return null;
    }

    const traceId = this.ctx.traceId || createId();
    const rootSpanId = this.traceSpans[0]?.id || createId();
    const endTime = Date.now();
    const totalDuration = endTime - this.chainStartTime;

    const trace: TraceData = {
      id: createId(),
      traceId,
      rootSpanId,
      startTime: this.chainStartTime,
      endTime,
      totalDuration,
      spans: this.traceSpans,
      plugins: Array.from(this.tracePlugins),
      errors: this.traceErrors,
      metadata: {
        callerPluginId: this.ctx.pluginId,
        callerCommand: this.ctx.routeOrCommand,
        chainDepth: this.chainDepth,
        chainFanOut: this.chainFanOut,
      },
    };

    const tracePath = await saveTrace(trace, this.ctx.workdir);
    
    // Rotate traces (keep last 50)
    await rotateTraces(50, this.ctx.workdir).catch(() => {
      // Ignore rotation errors
    });

    return tracePath;
  }
}
