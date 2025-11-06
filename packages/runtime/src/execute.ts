/**
 * @module @kb-labs/plugin-runtime/execute
 * Handler execution wrapper with validation, quotas, and error handling
 */

import type {
  ManifestV2,
} from '@kb-labs/plugin-manifest';
import type {
  ExecutionContext,
  ExecuteInput,
  ExecuteResult,
} from './types.js';
import type { PluginRegistry } from './registry.js';
import { ErrorCode } from '@kb-labs/api-contracts';
import { checkCapabilities } from './capabilities.js';
import { emitAnalyticsEvent } from './analytics.js';
import { 
  createSandboxRunner, 
  Profiler,
  ResourceTracker,
  validateContextVersion,
  createDebugLogger,
  createLoggerOptionsFromContext,
} from '@kb-labs/sandbox';
import { toErrorEnvelope, createErrorContext } from './errors.js';
import { createId } from './utils.js';
import { saveSnapshot, rotateSnapshots } from './snapshot.js';
import type { ErrorEnvelope } from './types.js';
// Import from refactored modules
import { validateInput, validateOutput } from './validation/index.js';
import { createRunnerConfig } from './runner/index.js';
import {
  initializeChainLimits,
  initializeChainState,
  createRemainingMsCalculator,
  buildExecutionContext,
  createArtifactBroker,
  createInvokeBroker,
  createAnalyticsEmitter,
} from './context/index.js';
import { writeArtifactsIfAny } from './artifacts/index.js';


/**
 * Execute handler with full runtime support
 */
/**
 * Execute handler with full runtime support
 * @param args - Execute input (supports both string and HandlerRef for handlerRef)
 * @param ctx - Execution context
 * @param registry - Optional plugin registry for cross-plugin invocation
 * @returns Execution result
 */
export async function execute(
  args: ExecuteInput,
  ctx: ExecutionContext,
  registry?: PluginRegistry
): Promise<ExecuteResult> {
  // HandlerRef is already in args.handler
  const handlerRef = args.handler;
  const startedAt = Date.now();

  // Create logger with unified options (spanId will be set after context is built)
  const loggerOptions = createLoggerOptionsFromContext(ctx, ctx.spanId, ctx.parentSpanId);
  const logger = createDebugLogger(ctx.debug || false, 'runtime:execute', loggerOptions);
  
  logger.group('execute');
  logger.debug('Execute function called', {
    handler: `${handlerRef.file}#${handlerRef.export}`,
    pluginRoot: ctx.pluginRoot,
  });

  // 3. Initialize chain limits and state
  const defaultTimeoutMs = args.perms.quotas?.timeoutMs || 30000;
  const chainLimits = initializeChainLimits(ctx, defaultTimeoutMs);
  const chainState = initializeChainState(ctx, defaultTimeoutMs);
  const remainingMs = createRemainingMsCalculator(startedAt, defaultTimeoutMs);

  // 4. Initialize brokers
  const artifactBaseDir = ctx.outdir || ctx.workdir;
  const artifactBroker = createArtifactBroker(
    args.manifest,
    ctx,
    registry,
    artifactBaseDir
  );
  const invokeBroker = registry
    ? createInvokeBroker(registry, args.manifest, ctx, chainLimits, chainState)
    : undefined;

  // 5. Create analytics emitter
  const analyticsEmitter = createAnalyticsEmitter(ctx);

  // 6. Create resource tracker for cleanup
  const resources = new ResourceTracker();
  
  // 7. Build updated context with trace info and analytics
  const updatedCtx = buildExecutionContext(
    ctx,
    chainLimits,
    chainState,
    remainingMs,
    analyticsEmitter,
    resources,
    invokeBroker,
    artifactBroker
  );
  
  // Validate context version
  validateContextVersion(updatedCtx);

  // Emit started event
  await emitAnalyticsEvent('plugin.exec.started', {
    pluginId: ctx.pluginId,
    pluginVersion: ctx.pluginVersion,
    routeOrCommand: ctx.routeOrCommand,
    handlerRef: `${args.handler.file}#${args.handler.export}`,
    requestId: ctx.requestId,
    traceId: updatedCtx.traceId,
    spanId: updatedCtx.spanId,
    parentSpanId: updatedCtx.parentSpanId,
    depth: chainState.depth,
  });

  // Check if profiling is enabled
  const debugLevel = ctx.debugLevel || (ctx.debug ? 'verbose' : undefined);
  const isProfiling = debugLevel === 'profile';
  let profiler: Profiler | undefined;

  if (isProfiling) {
    profiler = new Profiler(ctx, ctx.pluginId, ctx.routeOrCommand);
  }

  try {
    // 1. Check capabilities (deny-by-default)
    if (profiler) {
      profiler.startPhase('Capability check');
    }
    
    const requiredCapabilities = args.manifest.capabilities || [];
    if (requiredCapabilities.length > 0) {
      const grantedCapabilities = args.perms.capabilities || [];
      const capabilityCheck = checkCapabilities(
        requiredCapabilities,
        grantedCapabilities
      );

      if (profiler) {
        profiler.endPhase('Capability check');
      }

      if (!capabilityCheck.granted) {
        const metrics = { timeMs: Date.now() - startedAt };
        const error = toErrorEnvelope(
          ErrorCode.PLUGIN_CAPABILITY_MISSING,
          403,
          {
            missing: capabilityCheck.missing,
            requested: requiredCapabilities,
            granted: grantedCapabilities,
            ...createErrorContext(
              ErrorCode.PLUGIN_CAPABILITY_MISSING,
              'capability.check',
              undefined,
              `Required: ${requiredCapabilities.join(', ')}, Granted: ${grantedCapabilities.join(', ')}`
            ),
          },
          ctx,
          metrics,
          args.perms
        );

        await emitAnalyticsEvent('plugin.permission.denied', {
          pluginId: ctx.pluginId,
          pluginVersion: ctx.pluginVersion,
          routeOrCommand: ctx.routeOrCommand,
          reason: 'capability_missing',
          missing: capabilityCheck.missing,
          requestId: ctx.requestId,
        });

        return {
          ok: false,
          error,
          metrics,
        };
      }
    }

    // 2. Validate input schema (if provided)
    if (profiler) {
      profiler.startPhase('Input validation');
    }
    
        const vin = await validateInput(
          args.manifest,
          ctx.routeOrCommand,
          args.input,
          args.handler,
          ctx
        );
    
    if (profiler) {
      profiler.endPhase('Input validation');
    }
    
    if (!vin.ok) {
      const metrics = { timeMs: Date.now() - startedAt };
      const error = toErrorEnvelope(
        ErrorCode.PLUGIN_SCHEMA_VALIDATION_FAILED,
        422,
        {
          where: 'input',
          errors: vin.errors?.issues || [],
        },
        ctx,
        metrics,
        args.perms
      );

      return {
        ok: false,
        error,
        metrics,
      };
    }

    // 3. Create sandbox runner
    const debugLevel = ctx.debugLevel || (ctx.debug ? 'verbose' : undefined);
    const runnerConfig = createRunnerConfig(args, ctx);
    
    logger.group('sandbox');
    logger.debug('Creating sandbox runner', {
      mode: runnerConfig.mode,
      debugLevel: debugLevel || 'none',
    });
    
    const runner = createSandboxRunner(runnerConfig);

    // 4. Call lifecycle hooks
    await updatedCtx.hooks?.onStart?.();
    
    // 5. Run handler in sandbox
    if (profiler) {
      profiler.startPhase('Handler execution');
    }
    
      // Note: SandboxRunner.run() takes 3 args: handler, input, ctx
      // invokeBroker and artifactBroker are passed via ctx (if needed)
      let res: any;
      
      logger.group('runner.run');
      logger.debug('Calling runner.run', {
        handler: `${args.handler.file}#${args.handler.export}`,
        pluginRoot: updatedCtx.pluginRoot,
        workdir: updatedCtx.workdir,
      });
      
      try {
        res = await runner.run(args.handler, args.input, updatedCtx);
        
        logger.debug('runner.run completed', {
          resExists: !!res,
          resOk: res?.ok,
          hasError: !!res?.error,
        });
        
        // Log result structure for debugging (even without --debug if error)
        if (!res || !res.ok) {
          logger.error('Runner returned error', {
            resExists: !!res,
            resOk: res?.ok,
            error: res?.error ? JSON.stringify(res.error, null, 2) : undefined,
            fullRes: JSON.stringify(res, null, 2),
          });
        }
        
        logger.groupEnd();
      
      if (profiler) {
        profiler.endPhase('Handler execution');
      }
      
      // Call lifecycle hooks on success
      if (res && res.ok) {
        await updatedCtx.hooks?.onComplete?.(res.data);
      } else {
        const error = new Error(res?.error?.message || 'Handler execution failed');
        if (res?.error?.stack) {
          error.stack = res.error.stack;
        }
        await updatedCtx.hooks?.onError?.(error);
      }
          } catch (error) {
        logger.error('runner.run threw an error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : 'No stack trace',
        });
        logger.groupEnd();
      
      if (profiler) {
        profiler.endPhase('Handler execution');
      }
      
      // Call lifecycle hooks on error
      await updatedCtx.hooks?.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      // Always cleanup resources
      await resources.cleanup();
    }

          // 5. Output validation + artifacts
          // Handle error case first (if runner returned error)
          logger.debug('Checking result after execution', {
            resExists: !!res,
            resOk: res?.ok,
          });
          
          if (!res || !res.ok) {
            logger.debug('Handling error case', { resOk: res?.ok });
      // Runner returned error - handle it
      await emitAnalyticsEvent('plugin.exec.failed', {
        pluginId: ctx.pluginId,
        pluginVersion: ctx.pluginVersion,
        routeOrCommand: ctx.routeOrCommand,
        reason: 'handler_error',
        requestId: ctx.requestId,
        errorCode: res.error?.code || 'UNKNOWN',
        timeMs: res.metrics.timeMs,
      });

      // Stop profiler and add profile data to result (even on error)
      if (profiler) {
        const profileData = profiler.stop();
        (res as any).profile = profileData;
      }

      // Auto-save snapshot on error (for debugging)
      if (res.error) {
        try {
          // Extract error data from ErrorEnvelope
          const errorEnv = res.error as ErrorEnvelope;
          await saveSnapshot({
            command: ctx.routeOrCommand,
            pluginId: ctx.pluginId,
            pluginVersion: ctx.pluginVersion,
            input: args.input as Record<string, unknown>,
            context: {
              cwd: ctx.workdir,
              workdir: ctx.workdir,
              outdir: ctx.outdir,
              user: ctx.user?.id,
            },
            env: process.env as Record<string, string>,
            result: 'error',
            error: {
              code: errorEnv.code || 'UNKNOWN',
              message: errorEnv.message || 'Unknown error',
              stack: errorEnv.trace || undefined, // ErrorEnvelope uses 'trace' not 'stack'
              details: errorEnv.details || undefined,
            },
            logs: res.logs,
            metrics: res.metrics,
          }, ctx.workdir);
          
          // Rotate snapshots (keep last 30)
          await rotateSnapshots(30, ctx.workdir).catch(() => {
            // Ignore rotation errors
          });
        } catch {
          // Ignore snapshot save errors
        }
      }

      logger.groupEnd(); // sandbox
      logger.groupEnd(); // execute
      return res as ExecuteResult;
    }
    
    // Success case - continue with output validation
    // At this point res is defined and res.ok is true
    if (res && res.ok) {
      if (profiler) {
        profiler.startPhase('Output validation');
      }
      
          const vout = await validateOutput(
            args.manifest,
            ctx.routeOrCommand,
            res.data,
            args.handler,
            ctx
          );
      
      if (profiler) {
        profiler.endPhase('Output validation');
      }
      
      if (!vout.ok) {
        const metrics = { ...res.metrics, timeMs: Date.now() - startedAt };
        const error = toErrorEnvelope(
          ErrorCode.PLUGIN_SCHEMA_VALIDATION_FAILED,
          422,
          {
            where: 'output',
            errors: vout.errors?.issues || [],
          },
          ctx,
          metrics,
          args.perms
        );

        await emitAnalyticsEvent('plugin.exec.failed', {
          pluginId: ctx.pluginId,
          pluginVersion: ctx.pluginVersion,
          routeOrCommand: ctx.routeOrCommand,
          reason: 'output_validation_failed',
          requestId: ctx.requestId,
          timeMs: metrics.timeMs,
        });

        // Auto-save snapshot on validation error
        try {
          await saveSnapshot({
            command: ctx.routeOrCommand,
            pluginId: ctx.pluginId,
            pluginVersion: ctx.pluginVersion,
            input: args.input as Record<string, unknown>,
            context: {
              cwd: ctx.workdir,
              workdir: ctx.workdir,
              outdir: ctx.outdir,
              user: ctx.user?.id,
            },
            env: process.env as Record<string, string>,
            result: 'error',
            error: {
              code: error.code || 'VALIDATION_ERROR',
              message: error.message || 'Validation failed',
              details: error.details,
            },
            metrics,
          }, ctx.workdir);
          
          // Rotate snapshots (keep last 30)
          await rotateSnapshots(30, ctx.workdir).catch(() => {
            // Ignore rotation errors
          });
        } catch {
          // Ignore snapshot save errors
        }

        return {
          ok: false,
          error,
          metrics,
        };
      }

      // Write artifacts (if declared)
      logger.debug('Calling writeArtifactsIfAny', {
        hasBroker: !!artifactBroker,
        hasData: !!res.data,
      });
      await writeArtifactsIfAny(args.manifest, ctx, res.data, artifactBroker).catch((err) => {
        emitAnalyticsEvent('plugin.artifact.failed', {
          pluginId: ctx.pluginId,
          pluginVersion: ctx.pluginVersion,
          routeOrCommand: ctx.routeOrCommand,
          requestId: ctx.requestId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

      await emitAnalyticsEvent('plugin.exec.finished', {
        pluginId: ctx.pluginId,
        pluginVersion: ctx.pluginVersion,
        routeOrCommand: ctx.routeOrCommand,
        requestId: ctx.requestId,
        timeMs: res.metrics.timeMs,
        cpuMs: res.metrics.cpuMs,
        memMb: res.metrics.memMb,
      });

      // Stop profiler and add profile data to result
      if (profiler) {
        const profileData = profiler.stop();
        (res as any).profile = profileData;
      }

      // Save trace if there were cross-plugin invocations
      if (invokeBroker) {
        await invokeBroker.saveTrace().catch(() => {
          // Ignore trace save errors
        });
      }

      // Save snapshot if explicitly requested (--save-snapshot flag)
      if ((ctx as any).saveSnapshot) {
        try {
          await saveSnapshot({
            command: ctx.routeOrCommand,
            pluginId: ctx.pluginId,
            pluginVersion: ctx.pluginVersion,
            input: args.input as Record<string, unknown>,
            context: {
              cwd: ctx.workdir,
              workdir: ctx.workdir,
              outdir: ctx.outdir,
              user: ctx.user?.id,
            },
            env: process.env as Record<string, string>,
            result: 'success',
            logs: res.logs,
            metrics: res.metrics,
          }, ctx.workdir);
        } catch {
          // Ignore snapshot save errors
        }
      }

      logger.groupEnd(); // sandbox
      logger.groupEnd(); // execute
      return res as ExecuteResult;
    }
    
    // This should never be reached, but TypeScript needs it
    logger.groupEnd(); // sandbox
    logger.groupEnd(); // execute
    throw new Error('Unexpected execution path: res.ok is neither true nor false');
  } catch (error) {
    logger.groupEnd(); // sandbox
    logger.groupEnd(); // execute
    const timeMs = Date.now() - startedAt;
    const metrics = { timeMs };

    const errorEnvelope = toErrorEnvelope(
      ErrorCode.INTERNAL,
      500,
      {
        error: error instanceof Error ? error.message : String(error),
      },
      ctx,
      metrics,
      args.perms
    );

    await emitAnalyticsEvent('plugin.exec.failed', {
      pluginId: ctx.pluginId,
      pluginVersion: ctx.pluginVersion,
      routeOrCommand: ctx.routeOrCommand,
      reason: 'execution_error',
      requestId: ctx.requestId,
      timeMs,
      error: error instanceof Error ? error.message : String(error),
    });

    // Auto-save snapshot on error (for debugging)
    try {
      await saveSnapshot({
        command: ctx.routeOrCommand,
        pluginId: ctx.pluginId,
        pluginVersion: ctx.pluginVersion,
        input: args.input as Record<string, unknown>,
        context: {
          cwd: ctx.workdir,
          workdir: ctx.workdir,
          outdir: ctx.outdir,
          user: ctx.user?.id,
        },
        env: process.env as Record<string, string>,
        result: 'error',
          error: {
            code: errorEnvelope.code || 'INTERNAL',
            message: errorEnvelope.message || 'Internal error',
            stack: errorEnvelope.trace || (error instanceof Error ? error.stack : undefined),
            details: errorEnvelope.details,
          },
        metrics,
      }, ctx.workdir);
      
      // Rotate snapshots (keep last 30)
      await rotateSnapshots(30, ctx.workdir).catch(() => {
        // Ignore rotation errors
      });
    } catch {
      // Ignore snapshot save errors
    }

    return {
      ok: false,
      error: errorEnvelope,
      metrics,
    };
  }
}
