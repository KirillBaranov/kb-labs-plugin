/**
 * @module @kb-labs/plugin-runtime/execute
 * Handler execution wrapper with validation, quotas, and error handling
 */

import type {
  ManifestV2,
  SchemaRef,
  RestRouteDecl,
  CliCommandDecl,
} from '@kb-labs/plugin-manifest';
import type {
  ExecutionContext,
  ExecuteInput,
  ExecuteResult,
  HandlerRef,
} from './types.js';
import type { PluginRegistry } from './registry.js';
import type { InvokeBroker } from './invoke/broker.js';
import type { ArtifactBroker } from './artifacts/broker.js';
import type { ChainLimits, InvokeContext } from './invoke/types.js';
import { InvokeBroker as InvokeBrokerImpl } from './invoke/broker.js';
import { ArtifactBroker as ArtifactBrokerImpl } from './artifacts/broker.js';

/**
 * Parse handlerRef from string format (e.g., './rest/review.js#handle')
 * @param handlerRef - Handler reference string
 * @returns HandlerRef object
 */
function parseHandlerRef(handlerRef: string | HandlerRef): HandlerRef {
  if (typeof handlerRef === 'object') {
    return handlerRef;
  }
  const [file, exportName] = handlerRef.split('#');
  if (!exportName || !file) {
    throw new Error(`Handler reference must include export name: ${handlerRef}`);
  }
  return { file, export: exportName };
}
import { ErrorCode } from '@kb-labs/api-contracts';
import { checkCapabilities } from './capabilities.js';
import { emitAnalyticsEvent } from './analytics.js';
import { emit } from '@kb-labs/analytics-sdk-node';
import type { AnalyticsEventV1, EmitResult } from '@kb-labs/analytics-sdk-node';
import { 
  createSandboxRunner, 
  Profiler,
  ResourceTracker,
  CURRENT_CONTEXT_VERSION,
  validateContextVersion,
  createDebugLogger,
  createLoggerOptionsFromContext,
} from '@kb-labs/sandbox';
import type { ProfileData } from '@kb-labs/sandbox';
import { toErrorEnvelope, createErrorContext } from './errors.js';
import { createId } from './utils.js';
import { saveSnapshot, rotateSnapshots } from './snapshot.js';
import type { ErrorEnvelope } from './types.js';
import { z } from 'zod';
import * as path from 'node:path';

/**
 * Resolve and validate schema from SchemaRef
 */
async function resolveSchema(
  schemaRef: SchemaRef | undefined,
  basePath: string
): Promise<z.ZodTypeAny | undefined> {
  if (!schemaRef) {
    return undefined;
  }

  if ('zod' in schemaRef) {
    // Zod schema reference: './schemas/review.ts#ReviewSchema'
    const [modulePath, exportName] = schemaRef.zod.split('#');
    if (!exportName || !modulePath) {
      throw new Error(
        `Schema reference must include export name: ${schemaRef.zod}`
      );
    }

    let resolvedPath: string;
    
    if (modulePath.startsWith('.')) {
      // Relative path - resolve relative to basePath
      // Use path.resolve for proper path resolution
      resolvedPath = path.resolve(basePath, modulePath);
      // For ESM, we need to add .js if not present
      if (!resolvedPath.endsWith('.js') && !resolvedPath.endsWith('.ts')) {
        // Try to find .js file in dist directory first (most common case)
        const distPath = path.join(basePath, 'dist', modulePath.replace(/^\.\//, '') + '.js');
        const fs = await import('node:fs/promises');
        try {
          await fs.access(distPath);
          resolvedPath = distPath;
        } catch {
          // Fallback to adding .js extension to resolved path
          resolvedPath = resolvedPath + '.js';
        }
      }
    } else {
      // Absolute or package path - use as-is
      resolvedPath = modulePath;
    }

    const module = await import(resolvedPath);
    const schema = module[exportName];

    if (!schema || typeof schema.parse !== 'function') {
      throw new Error(
        `Schema ${exportName} not found or not a Zod schema in ${modulePath}`
      );
    }

    return schema as z.ZodTypeAny;
  }

  // OpenAPI $ref - for now, return undefined (validation happens at API level)
  return undefined;
}

/**
 * Validate input/output against schema
 */
function validateSchema<T>(
  data: unknown,
  schema: z.ZodTypeAny | undefined
): { valid: boolean; data?: T; errors?: z.ZodError } {
  if (!schema) {
    return { valid: true, data: data as T };
  }

  const result = schema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data as T };
  }

  return { valid: false, errors: result.error };
}

/**
 * Validate input schema
 */
async function validateInput(
  manifest: ManifestV2,
  routeOrCommand: string,
  input: unknown,
  handlerRef: HandlerRef,
  ctx?: ExecutionContext
): Promise<{ ok: boolean; errors?: z.ZodError }> {
  // Find route or command
  const handlerRefStr = `${handlerRef.file}#${handlerRef.export}`;
  const restRoute = manifest.rest?.routes.find(
    (r: RestRouteDecl) => r.handler === handlerRefStr
  );
  const cliCommand = manifest.cli?.commands.find(
    (c: CliCommandDecl) => c.handler === handlerRefStr
  );

  const inputSchemaRef = restRoute?.input || undefined;
  if (!inputSchemaRef) {
    return { ok: true };
  }

  // Use pluginRoot from context (required)
  if (!ctx?.pluginRoot) {
    throw new Error('pluginRoot is required in ExecutionContext');
  }
  const basePath = ctx.pluginRoot;
  const schema = await resolveSchema(inputSchemaRef, basePath);
  const validation = validateSchema(input, schema);

  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  return { ok: true };
}

/**
 * Validate output schema
 */
async function validateOutput(
  manifest: ManifestV2,
  routeOrCommand: string,
  output: unknown,
  handlerRef: HandlerRef,
  ctx?: ExecutionContext
): Promise<{ ok: boolean; errors?: z.ZodError }> {
  // Find route or command
  const handlerRefStr = `${handlerRef.file}#${handlerRef.export}`;
  const restRoute = manifest.rest?.routes.find(
    (r: RestRouteDecl) => r.handler === handlerRefStr
  );
  const cliCommand = manifest.cli?.commands.find(
    (c: CliCommandDecl) => c.handler === handlerRefStr
  );

  const outputSchemaRef = restRoute?.output || undefined;
  if (!outputSchemaRef) {
    return { ok: true };
  }

  // Use pluginRoot from context (required)
  if (!ctx?.pluginRoot) {
    throw new Error('pluginRoot is required in ExecutionContext');
  }
  const basePath = ctx.pluginRoot;
  const schema = await resolveSchema(outputSchemaRef, basePath);
  const validation = validateSchema(output, schema);

  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  return { ok: true };
}

/**
 * Write artifacts if declared
 */
async function writeArtifactsIfAny(
  manifest: ManifestV2,
  ctx: ExecutionContext,
  data: unknown,
  artifactBroker?: ArtifactBroker
): Promise<void> {
  if (!manifest.artifacts || manifest.artifacts.length === 0) {
    return;
  }

  const loggerOptions = createLoggerOptionsFromContext(ctx);
  const logger = createDebugLogger(ctx.debug || false, 'runtime:artifacts', loggerOptions);
  const { substitutePathTemplate } = await import('./artifacts.js');

  // Use artifactBroker if available, otherwise fall back to old writeArtifact
  const useNewSystem = artifactBroker !== undefined;
  
  // Always log system selection for debugging (remove after testing)
  // console.log('[writeArtifactsIfAny] Artifact system selection', {
  //   useNewSystem,
  //   hasBroker: !!artifactBroker,
  //   artifactCount: manifest.artifacts?.length || 0,
  // });
  
  logger.debug('Artifact system selection', {
    useNewSystem,
    hasBroker: !!artifactBroker,
    artifactCount: manifest.artifacts?.length || 0,
  });

  for (const artifactDecl of manifest.artifacts) {
    try {
      // Extract artifact-specific data if data is an object with artifact keys
      // If data is an object, try to find a field matching artifact id (e.g., 'pack-output', 'query-output')
      // Otherwise, use data as-is
      let artifactData = data;
      if (data && typeof data === 'object' && !Array.isArray(data) && artifactDecl.id) {
        // Skip if data has exitCode (it's a command result wrapper)
        // Extract only artifact data, not the wrapper
        const dataObj = data as Record<string, unknown>;
        
        // Skip exitCode field
        if ('exitCode' in dataObj) {
          // This is a command result with exitCode, extract artifact data
          const artifactId = artifactDecl.id;
          const camelCaseId = artifactId.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          const kebabCaseId = artifactId;
          
          // Check for artifact field in the result object
          if (artifactId in dataObj) {
            artifactData = dataObj[artifactId];
          } else if (camelCaseId in dataObj) {
            artifactData = dataObj[camelCaseId];
          } else if (kebabCaseId in dataObj) {
            artifactData = dataObj[kebabCaseId];
          } else {
            // No artifact data found, skip this artifact
            artifactData = undefined;
          }
        } else {
          // Not a command result wrapper, try to find artifact field
          const artifactId = artifactDecl.id;
          const camelCaseId = artifactId.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          const kebabCaseId = artifactId;
          
          // Check for camelCase first (packOutput), then kebab-case (pack-output), then exact match
          if (artifactId in dataObj) {
            artifactData = dataObj[artifactId];
          } else if (camelCaseId in dataObj) {
            artifactData = dataObj[camelCaseId];
          } else if (kebabCaseId in dataObj) {
            artifactData = dataObj[kebabCaseId];
          }
          // If no match found, use data as-is (for backward compatibility)
        }
      }

      // Skip if artifact data is undefined or null
      if (artifactData === undefined || artifactData === null) {
        logger.debug('Skipping artifact (no data)', {
          artifactId: artifactDecl.id,
        });
        continue;
      }

      if (useNewSystem && artifactBroker) {
        // Use new artifact system with URI scheme
        logger.debug('Using new artifact system', {
          artifactId: artifactDecl.id,
        });
        
        // Resolve path template to get the actual path
        const resolvedPath = substitutePathTemplate(artifactDecl.pathTemplate, {
          runId: ctx.requestId,
          profile: 'default',
          pluginId: ctx.pluginId,
        });

        // Create URI: artifact://plugin-id/path
        const artifactUri = `artifact://${ctx.pluginId}/${resolvedPath}`;

        // Determine content type
        let contentType = 'application/json';
        if (resolvedPath.endsWith('.md')) {
          contentType = 'text/markdown';
        } else if (resolvedPath.endsWith('.toon')) {
          contentType = 'application/octet-stream';
        } else if (typeof artifactData === 'string') {
          contentType = 'text/plain';
        }

        logger.debug('Writing artifact via broker', {
          artifactId: artifactDecl.id,
          uri: artifactUri,
          contentType,
        });

        try {
          const result = await artifactBroker.write({
            uri: artifactUri,
            data: artifactData,
            contentType,
            ttl: artifactDecl.ttl,
            mode: 'upsert',
          });

          logger.debug('Artifact written', {
            artifactId: artifactDecl.id,
            uri: artifactUri,
            path: result.path,
            status: result.meta.status,
          });

          // Track artifact file for cleanup
          if (!ctx.tmpFiles) {
            ctx.tmpFiles = [];
          }
          ctx.tmpFiles.push(result.path);
        } catch (error) {
          // Log full error details for debugging
          const errorDetails = error && typeof error === 'object' 
            ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
            : String(error);
          logger.warn('Failed to write artifact via broker', {
            artifactId: artifactDecl.id,
            uri: artifactUri,
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            errorDetails,
          });
          // Also log to console for immediate visibility
          console.error('[writeArtifactsIfAny] Error writing artifact:', {
            artifactId: artifactDecl.id,
            uri: artifactUri,
            error: errorDetails,
            errorCode: error && typeof error === 'object' && 'code' in error ? (error as any).code : undefined,
            errorHttp: error && typeof error === 'object' && 'http' in error ? (error as any).http : undefined,
            errorMessage: error && typeof error === 'object' && 'message' in error ? (error as any).message : undefined,
            errorDetails: error && typeof error === 'object' ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2) : undefined,
          });
        }
      } else {
        // Fall back to old system
        logger.debug('Using legacy artifact system', {
          artifactId: artifactDecl.id,
          useNewSystem,
          hasBroker: !!artifactBroker,
        });
        
        const { writeArtifact } = await import('./artifacts.js');
        const result = await writeArtifact(
          artifactDecl,
          artifactData,
          {
            requestId: ctx.requestId,
            pluginId: ctx.pluginId,
            pluginVersion: ctx.pluginVersion,
            basePath: ctx.outdir || ctx.workdir,
            variables: {
              runId: ctx.requestId,
              profile: 'default',
            },
          }
        );

        if (result.success && result.path) {
          logger.debug('Artifact written (legacy)', {
            artifactId: artifactDecl.id,
            path: result.path,
          });
          // Track artifact file for cleanup
          if (!ctx.tmpFiles) {
            ctx.tmpFiles = [];
          }
          ctx.tmpFiles.push(result.path);
        } else {
          logger.warn('Failed to write artifact (legacy)', {
            artifactId: artifactDecl.id,
            error: result.error,
          });
        }
      }
    } catch (error) {
      // Log error but don't fail execution
      logger.error('Failed to write artifact', {
        pluginId: ctx.pluginId,
        artifactId: artifactDecl.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

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

  // 1. Generate or inherit traceId
  const traceId = ctx.traceId || createId();

  // 2. Generate spanId for current execution
  const spanId = ctx.spanId || createId();

  // Create logger with unified options
  const loggerOptions = createLoggerOptionsFromContext(ctx, spanId, ctx.parentSpanId);
  const logger = createDebugLogger(ctx.debug || false, 'runtime:execute', loggerOptions);
  
  logger.group('execute');
  logger.debug('Execute function called', {
    handler: `${handlerRef.file}#${handlerRef.export}`,
    pluginRoot: ctx.pluginRoot,
    traceId,
    spanId,
  });

  // 3. Initialize chain limits
  const chainLimits: ChainLimits = ctx.chainLimits || {
    maxDepth: 8,
    maxFanOut: 16,
    maxChainTime: args.perms.quotas?.timeoutMs || 30000,
  };

  // 4. Initialize chain state
  const chainState: InvokeContext = ctx.chainState || {
    depth: 0,
    fanOut: 0,
    visited: [],
    remainingMs: args.perms.quotas?.timeoutMs || 30000,
  };

  // 5. Calculate remainingMs function
  const remainingMs = (): number => {
    const elapsed = Date.now() - startedAt;
    const initial = args.perms.quotas?.timeoutMs || 30000;
    return Math.max(0, initial - elapsed);
  };

  // 6. Initialize brokers
  // artifactBroker is always created for artifact management (even without registry)
  // invokeBroker is only created if registry is provided (for cross-plugin calls)
  let invokeBroker: InvokeBroker | undefined;
  let artifactBroker: ArtifactBroker | undefined;

  // Create artifact broker (always needed for artifact management)
  // Use ctx.outdir or ctx.workdir as artifact base directory
  const artifactBaseDir = ctx.outdir || ctx.workdir;
  artifactBroker = new ArtifactBrokerImpl(
    args.manifest,
    ctx,
    registry, // registry is optional - only needed for cross-plugin artifact access
    artifactBaseDir // Use outdir or workdir as base for artifacts
  );

  // Create invoke broker only if registry is provided (for cross-plugin invocation)
  if (registry) {
    invokeBroker = new InvokeBrokerImpl(
      registry,
      args.manifest,
      ctx,
      chainLimits,
      chainState
    );
  }

  // 7. Create analytics emitter for injection into context
  // This allows plugins to track custom events scoped to this execution
  const analyticsEmitter = async (event: Partial<AnalyticsEventV1>): Promise<EmitResult> => {
    try {
      // Use analytics SDK emit with execution context
      return await emit({
        ...event,
        runId: ctx.requestId,
        actor: event.actor || {
          type: 'agent',
          id: ctx.pluginId,
          name: ctx.pluginId,
        },
        ctx: {
          ...event.ctx,
          workspace: ctx.workdir,
          command: ctx.routeOrCommand,
        },
      });
    } catch (error) {
      // Never throw - analytics failures should not break execution
      return { queued: false, reason: error instanceof Error ? error.message : String(error) };
    }
  };

  // 8. Create resource tracker for cleanup
  const resources = new ResourceTracker();
  
  // 9. Update context with trace info and analytics
  // Ensure pluginRoot is preserved in updatedCtx (required)
  if (!ctx.pluginRoot) {
    throw new Error('pluginRoot is required in ExecutionContext');
  }
  
  const updatedCtx: ExecutionContext = {
    ...ctx,
    version: ctx.version || CURRENT_CONTEXT_VERSION,
    traceId,
    spanId,
    parentSpanId: ctx.parentSpanId,
    chainLimits,
    chainState,
    remainingMs,
    analytics: analyticsEmitter,
    resources,
    // Explicitly preserve pluginRoot (required)
    pluginRoot: ctx.pluginRoot,
    // Preserve adapter context and metadata
    adapterContext: ctx.adapterContext,
    adapterMeta: ctx.adapterMeta,
    // Add brokers to extensions
    extensions: {
      ...ctx.extensions,
      artifacts: artifactBroker,
      invoke: invokeBroker,
    },
    // Preserve hooks
    hooks: ctx.hooks,
    // Preserve signal
    signal: ctx.signal,
  };
  
  // Validate context version
  validateContextVersion(updatedCtx);

  // Emit started event
  await emitAnalyticsEvent('plugin.exec.started', {
    pluginId: ctx.pluginId,
    pluginVersion: ctx.pluginVersion,
    routeOrCommand: ctx.routeOrCommand,
    handlerRef: `${args.handler.file}#${args.handler.export}`,
    requestId: ctx.requestId,
    traceId,
    spanId,
    parentSpanId: ctx.parentSpanId,
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

    // 3. Choose runner (MVP: subprocess, or in-process for dev mode)
    // Extract debugLevel from context
    const debugLevel = ctx.debugLevel || (ctx.debug ? 'verbose' : undefined);
    
    // For inspect mode, we MUST use subprocess (Node.js debugger requires separate process)
    const needsSubprocess = debugLevel === 'inspect';
    // For other debug modes, use inprocess for faster iteration
    const useInprocess = ctx.debug && !needsSubprocess;
    
    const runnerMode = needsSubprocess ? 'subprocess' : (useInprocess ? 'inprocess' : 'subprocess');
    
    logger.group('sandbox');
    logger.debug('Creating sandbox runner', {
      mode: runnerMode,
      debugLevel: debugLevel || 'none',
    });
    
    const runner = createSandboxRunner({
      execution: {
        timeoutMs: args.perms.quotas?.timeoutMs ?? 60000,
        graceMs: 5000,
        memoryMb: args.perms.quotas?.memoryMb ?? 512,
      },
      permissions: {
        env: { allow: args.perms.env?.allow || [] },
        filesystem: { allow: [], deny: [], readOnly: false },
        network: { allow: [], deny: [] },
        capabilities: args.perms.capabilities || [],
      },
      monitoring: {
        // Always collect logs (for error display even without --debug)
        // But only stream in real-time when debug is enabled
        collectLogs: true,
        collectMetrics: true,
        collectTraces: true,
        logBufferSizeMb: 1, // ~50 lines buffer
      },
      mode: needsSubprocess ? 'subprocess' : (useInprocess ? 'inprocess' : 'subprocess'),
      devMode: useInprocess, // true only for verbose/simple debug, not for inspect
    });

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
