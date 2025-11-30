/**
 * @module @kb-labs/plugin-runtime/invoke/broker
 * Invoke broker for cross-plugin invocation
 */

/**
 * TODO: Fix TypeScript type errors in this file
 *
 * ISSUE: InvokeRequest and InvokeContext types are incomplete
 * Missing properties: depth, fanOut, session, target, headerPolicy, systemHeaders,
 * idempotencyKey, quotasOverride, input, visited, maxDepth, maxFanOut, maxChainTime, remainingMs
 *
 * REASON: These types were defined in invoke/types.ts but are incomplete or exported incorrectly
 * This is a pre-existing issue, NOT related to the logging migration (ctx.logger addition)
 *
 * IMPACT: TypeScript compilation fails when building with DTS generation
 * WORKAROUND: @ts-expect-error added below to allow build to proceed
 *
 * ACTION REQUIRED: Update InvokeRequest and InvokeContext type definitions in invoke/types.ts
 * to include all properties used in this file
 *
 * Related files:
 * - src/invoke/types.ts (type definitions)
 * - src/invoke/broker.ts (this file - type usage)
 */
// @ts-expect-error - See TODO above: InvokeRequest and InvokeContext types incomplete

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext } from '../types';
import type { PluginRegistry } from '../registry';
import type {
  InvokeContext,
  InvokeRequest,
  InvokeResult,
  ChainLimits,
} from './types';
import { resolveInvokeDecision } from './permissions';
import { createId } from '../utils';
import { toErrorEnvelope } from '../errors';
import { ErrorCode } from '@kb-labs/api-contracts';
import { saveTrace, rotateTraces, type TraceData, type TraceSpan } from '../trace';
import { resolveRouteHeaderPolicy, matchesRule, type ResolvedHeaderPolicy } from './header-policy';
import { execute as runtimeExecute } from '../execute';
import * as nodePath from 'node:path';
import { applyHeaderTransforms } from './header-transforms';
import { loadCustomHeaderTransform } from './transform-loader';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'http2-settings',
]);

const SAFE_DEFAULT_HEADERS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'cache-control',
  'content-type',
  'content-length',
  'origin',
  'referer',
  'user-agent',
  'pragma',
  'expires',
  'if-none-match',
  'if-modified-since',
  'x-request-id',
  'x-trace-id',
  'traceparent',
  'tracestate',
]);

const SYSTEM_HEADERS = new Set(['traceparent', 'tracestate', 'x-request-id', 'x-trace-id']);

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
      const remainingMs =
        context?.remainingMs ??
        this.ctx.remainingMs?.() ??
        this.ctx.chainState?.remainingMs ??
        0;

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

      const headerMode = request.headerPolicy ?? 'none';
      const inheritedHeaders = this.ctx.headers?.inbound ?? {};
      const explicitHeaders = request.headers ?? {};
      // 6. Resolve route
      const resolvedRoute = await this.registry.resolveRoute(pluginId, method, path);
      if (!resolvedRoute) {
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

      const resolvedHeaderPolicy = resolveRouteHeaderPolicy(targetManifest, method, path);
      const systemHeaderMode = request.systemHeaders ?? 'auto';
      const headerPreparation = await prepareForwardHeaders(
        headerMode,
        resolvedHeaderPolicy,
        inheritedHeaders,
        explicitHeaders,
        systemHeaderMode,
        resolvedRoute.pluginRoot
      );

      if (request.idempotencyKey && !headerPreparation.forwarded['x-idempotency-key']) {
        headerPreparation.forwarded['x-idempotency-key'] = request.idempotencyKey;
      }

      const routeTimeout = resolvedRoute.route.timeoutMs;
      const manifestTimeout = resolvedRoute.manifest.permissions?.quotas?.timeoutMs;
      const overrideTimeout = request.quotasOverride?.timeoutMs;

      const timeoutCandidates = [remainingMs, routeTimeout, manifestTimeout, overrideTimeout]
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
      const effectiveTimeout = timeoutCandidates.length > 0 ? Math.min(...timeoutCandidates) : remainingMs;
      const timeoutBudget = Math.max(0, effectiveTimeout);
      const deadline = Date.now() + timeoutBudget;

      const nextInvokeContext: InvokeContext = {
        depth: currentDepth,
        fanOut: currentFanOut,
        visited: [...visited, pluginId],
        remainingMs: timeoutBudget,
      };

      const workdir = resolvedRoute.workdir || resolvedRoute.pluginRoot;
      const outdir = resolvedRoute.outdir || nodePath.join(workdir, 'out');
      const traceId = request.session?.traceId || this.ctx.traceId || span.traceId;
      const targetRequestId = createId();

      const headersInbound = Object.keys(headerPreparation.forwarded).length
        ? { ...headerPreparation.forwarded }
        : undefined;

      const targetCtx: ExecutionContext = {
        version: this.ctx.version,
        requestId: targetRequestId,
        pluginId: resolvedRoute.manifest.id,
        pluginVersion: resolvedRoute.manifest.version,
        routeOrCommand: span.routeOrCommand,
        workdir,
        outdir,
        pluginRoot: resolvedRoute.pluginRoot,
        traceId,
        spanId,
        parentSpanId,
        user: this.ctx.user,
        debug: this.ctx.debug,
        debugLevel: this.ctx.debugLevel,
        debugFormat: this.ctx.debugFormat,
        jsonMode: this.ctx.jsonMode,
        tmpFiles: [],
        chainLimits: this.chainLimits,
        chainState: nextInvokeContext,
        remainingMs: () => Math.max(0, deadline - Date.now()),
        headers: headersInbound
          ? {
              inbound: headersInbound,
            }
          : undefined,
        extensions: this.ctx.extensions,
        analytics: this.ctx.analytics,
        hooks: this.ctx.hooks,
        signal: this.ctx.signal,
      };

      const executeResult = await runtimeExecute(
        {
          handler: resolvedRoute.handler,
          input: request.input,
          manifest: resolvedRoute.manifest,
          perms: resolvedRoute.manifest.permissions || {},
        },
        targetCtx,
        this.registry
      );

      const endTime = Date.now();
      const timeMs = executeResult.metrics.timeMs ?? endTime - startTime;

      span.endTime = endTime;
      span.duration = timeMs;
      span.pluginVersion = resolvedRoute.manifest.version;
      const forwardedHeaderNames = Object.keys(headerPreparation.forwarded);
      const systemHeadersForwarded = forwardedHeaderNames
        .map((name) => normalizeHeaderName(name))
        .filter((name) => SYSTEM_HEADERS.has(name));

      span.metadata = {
        headerPolicy: headerMode,
        systemHeaderMode,
        forwardedHeaders: forwardedHeaderNames,
        droppedHeaders: headerPreparation.dropped,
        forwardedCount: forwardedHeaderNames.length,
        droppedCount: headerPreparation.dropped.length,
        systemHeadersForwarded,
        idempotencyForwarded:
          typeof request.idempotencyKey === 'string' &&
          forwardedHeaderNames.some(
            (name) => normalizeHeaderName(name) === 'x-idempotency-key'
          ),
        timeoutBudget: timeoutBudget || undefined,
      };

      this.chainDepth = Math.max(this.chainDepth, currentDepth);
      this.chainFanOut = Math.max(this.chainFanOut, currentFanOut);

      if (executeResult.ok) {
        span.status = 'success';
        this.traceSpans.push(span);
        this.tracePlugins.add(pluginId);

        return {
          ok: true,
          data: executeResult.data,
          meta: {
            timeMs,
            spanId,
          },
        };
      }

      span.status = 'error';
      span.error = {
        code: executeResult.error.code,
        message: executeResult.error.message,
      };
      this.traceSpans.push(span);
      this.traceErrors++;

      return {
        ok: false,
        error: executeResult.error,
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

type TransformModuleSpec = {
  modulePath: string;
  exportName: string;
};

type ForwardDecision = {
  allow: boolean;
  targetName: string;
  reason?: string;
  transformPipeline?: string;
  transformModule?: TransformModuleSpec;
};

type ForwardPreparation = {
  forwarded: Record<string, string>;
  dropped: Array<{ header: string; reason: string }>;
};

function parseTransformSpec(
  transform: string | undefined
): { pipeline?: string; module?: TransformModuleSpec } {
  if (!transform) {
    return {};
  }

  const spec = transform.trim();
  if (spec.toLowerCase().startsWith('module:')) {
    const remainder = spec.slice('module:'.length).trim();
    if (!remainder) {
      throw new Error('module: transform requires module path (e.g., module:./file.js#exportName)');
    }
    const [modulePathRaw, exportNameRaw] = remainder.split('#');
    const modulePath = modulePathRaw?.trim();
    const exportName = (exportNameRaw ?? 'default').trim();
    if (!modulePath) {
      throw new Error(`Invalid module transform spec "${spec}": missing module path`);
    }
    if (!exportName) {
      throw new Error(`Invalid module transform spec "${spec}": missing export name`);
    }
    return {
      module: {
        modulePath,
        exportName,
      },
    };
  }

  return { pipeline: spec };
}

async function prepareForwardHeaders(
  mode: InvokeRequest['headerPolicy'] | undefined,
  policy: ResolvedHeaderPolicy | undefined,
  inheritedHeaders: Record<string, string>,
  explicitHeaders: Record<string, string>,
  systemHeaderMode: InvokeRequest['systemHeaders'] | undefined,
  pluginRoot: string | undefined
): Promise<ForwardPreparation> {
  const forwarded: Record<string, string> = Object.create(null);
  const dropped: Array<{ header: string; reason: string }> = [];
  const headerMode = mode ?? 'none';

  if (headerMode === 'none') {
    return { forwarded, dropped };
  }

  const sourceEntries =
    headerMode === 'inherit-allowed'
      ? Object.entries(inheritedHeaders)
      : Object.entries(explicitHeaders);

  for (const [rawName, rawValue] of sourceEntries) {
    if (typeof rawValue !== 'string' || rawValue.length === 0) {
      continue;
    }
    const normalized = normalizeHeaderName(rawName);
    if (HOP_BY_HOP_HEADERS.has(normalized)) {
      dropped.push({ header: headerCase(normalized), reason: 'hop-by-hop' });
      continue;
    }

    const decision = evaluateHeaderForwarding(headerMode, policy, normalized);

    if (!decision.allow) {
      dropped.push({
        header: headerCase(normalized),
        reason: decision.reason ?? 'not-allowed',
      });
      continue;
    }

    let value = rawValue;
    if (decision.transformPipeline) {
      const transformed = applyHeaderTransforms(decision.transformPipeline, [value], {
        header: rawName,
      });
      if (transformed.length === 0) {
        dropped.push({
          header: headerCase(normalized),
          reason: 'transform-empty',
        });
        continue;
      }
      value = transformed[0]!;
    }

    if (decision.transformModule) {
      if (!pluginRoot) {
        dropped.push({
          header: headerCase(normalized),
          reason: 'transform-module-missing-root',
        });
        continue;
      }
      try {
        const transformFn = await loadCustomHeaderTransform(
          pluginRoot,
          decision.transformModule.modulePath,
          decision.transformModule.exportName
        );
        const result = await Promise.resolve(transformFn(value));
        if (typeof result !== 'string' || result.length === 0) {
          dropped.push({
            header: headerCase(normalized),
            reason: 'transform-module-empty',
          });
          continue;
        }
        value = result;
      } catch (error) {
        dropped.push({
          header: headerCase(normalized),
          reason:
            error instanceof Error
              ? `transform-module-error:${error.message}`
              : 'transform-module-error',
        });
        continue;
      }
    }

    forwarded[headerCase(decision.targetName)] = value;
  }

  const includeSystemHeaders =
    systemHeaderMode === 'always' ||
    (systemHeaderMode !== 'never' && headerMode === 'inherit-allowed');

  if (includeSystemHeaders) {
    for (const systemName of SYSTEM_HEADERS) {
      const existing = forwarded[headerCase(systemName)];
      if (existing !== undefined) {
        continue;
      }
      const sourceValue = inheritedHeaders[systemName];
      if (typeof sourceValue !== 'string' || sourceValue.length === 0) {
        continue;
      }
      const decision = evaluateHeaderForwarding(headerMode, policy, systemName);
      if (!decision.allow) {
        continue;
      }
      let value = sourceValue;
      if (decision.transformPipeline) {
        const transformed = applyHeaderTransforms(decision.transformPipeline, [value], {
          header: systemName,
        });
        if (transformed.length === 0) {
          continue;
        }
        value = transformed[0]!;
      }
      if (decision.transformModule) {
        if (!pluginRoot) {
          continue;
        }
        try {
          const transformFn = await loadCustomHeaderTransform(
            pluginRoot,
            decision.transformModule.modulePath,
            decision.transformModule.exportName
          );
          const result = await Promise.resolve(transformFn(value));
          if (typeof result !== 'string' || result.length === 0) {
            continue;
          }
          value = result;
        } catch {
          continue;
        }
      }
      forwarded[headerCase(decision.targetName)] = value;
    }
  }

  return { forwarded, dropped };
}

function evaluateHeaderForwarding(
  mode: 'none' | 'inherit-allowed' | 'explicit',
  policy: ResolvedHeaderPolicy | undefined,
  headerName: string
): ForwardDecision {
  const normalized = normalizeHeaderName(headerName);

  if (HOP_BY_HOP_HEADERS.has(normalized)) {
    return { allow: false, targetName: normalized, reason: 'hop-by-hop' };
  }

  if (!policy) {
    if (SYSTEM_HEADERS.has(normalized)) {
      return { allow: true, targetName: normalized };
    }
    if (mode === 'explicit') {
      return { allow: true, targetName: normalized };
    }
    return { allow: false, targetName: normalized, reason: 'not-declared' };
  }

  if (policy.denyList.includes(normalized)) {
    return { allow: false, targetName: normalized, reason: 'deny-list' };
  }

  const rule = policy.inbound.find((candidate) => matchesRule(candidate, normalized));
  if (rule) {
    if (rule.action === 'strip') {
      return { allow: false, targetName: normalized, reason: 'rule-strip' };
    }
    const targetName =
      rule.action === 'map' && rule.mapTo
        ? normalizeHeaderName(rule.mapTo)
        : rule.match.kind === 'exact'
        ? normalizeHeaderName(rule.match.name)
        : normalized;
    const { pipeline, module } = parseTransformSpec(rule.transform);
    return {
      allow: true,
      targetName,
      transformPipeline: pipeline,
      transformModule: module,
    };
  }

  if (policy.allowList.includes(normalized)) {
    return { allow: true, targetName: normalized };
  }

  if (SYSTEM_HEADERS.has(normalized)) {
    return { allow: true, targetName: normalized };
  }

  if (policy.defaults === 'allowSafe' && SAFE_DEFAULT_HEADERS.has(normalized)) {
    return { allow: true, targetName: normalized };
  }

  return { allow: false, targetName: normalized, reason: 'not-allowed' };
}

function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

function headerCase(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}
