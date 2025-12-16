/**
 * @module @kb-labs/plugin-runtime/execute-plugin
 * Plugin execution with sandbox isolation
 *
 * @see ADR-0010: Sandbox Execution Model
 * @see ADR-0015: Execution Adapters Architecture
 */

import type { ExecutePluginOptions, ExecutePluginResult } from './types';
import type { ExecutionContext } from '../types';
import { checkCapabilities } from './capabilities';
import { validateInput, validateOutput } from './validation';
import { writeArtifacts } from './artifacts';
import { nodeSubprocRunner } from '../sandbox/node-subproc';
import { selectRunnerMode } from '../runner/runner-selector';

/**
 * Execute plugin command with full validation and sandbox isolation
 *
 * This is the SINGLE PLACE for all plugin execution logic:
 * - Capability checking
 * - Input/output validation
 * - Sandbox runner selection (subprocess by default, inprocess for --debug)
 * - Handler execution with buildRuntime() providing ctx.runtime, ctx.api, ctx.output
 * - Artifact writing
 * - Error handling
 */
export async function executePlugin(
  options: ExecutePluginOptions
): Promise<ExecutePluginResult> {
  const {
    context,
    handlerRef,
    argv,
    flags,
    manifest,
    permissions,
    grantedCapabilities = [],
    pluginRoot,
  } = options;

  const startedAt = Date.now();
  const isDebug = process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG;

  if (isDebug) {
    console.error('[executePlugin] START', {
      manifestId: manifest.id,
      handlerRef,
      pluginRoot,
      hasContext: !!context,
    });
  }

  try {
    // 1. Check capabilities (deny-by-default)
    const requiredCapabilities = manifest.capabilities || [];
    if (requiredCapabilities.length > 0) {
      const capCheck = checkCapabilities(requiredCapabilities, grantedCapabilities);

      if (!capCheck.granted) {
        return {
          ok: false,
          error: {
            code: 'PLUGIN_CAPABILITY_MISSING',
            message: `Missing capabilities: ${capCheck.missing.join(', ')}`,
            details: {
              required: requiredCapabilities,
              granted: grantedCapabilities,
              missing: capCheck.missing,
            },
          },
          metrics: { timeMs: Date.now() - startedAt },
        };
      }
    }

    // 2. Validate input (flags)
    if (isDebug) {
      console.error('[executePlugin] Validating input');
    }
    const inputValidation = await validateInput(manifest, handlerRef, flags);
    if (!inputValidation.ok) {
      if (isDebug) {
        console.error('[executePlugin] Input validation FAILED', inputValidation.errors);
      }
      return {
        ok: false,
        error: {
          code: 'PLUGIN_SCHEMA_VALIDATION_FAILED',
          message: 'Input validation failed',
          details: {
            where: 'input',
            errors: inputValidation.errors?.issues || [],
          },
        },
        metrics: { timeMs: Date.now() - startedAt },
      };
    }

    // 3. Build ExecutionContext for sandbox runner
    // Convert PluginContextV2 to ExecutionContext with all required fields
    const executionType = options.executionType ?? 'cli';

    // Extract debug flag from metadata (it's unknown type, so need to check properly)
    const debugFlag = Boolean(context.metadata?.debug);
    const jsonModeFlag = Boolean(context.metadata?.jsonMode);

    const execCtx: ExecutionContext = {
      requestId: context.requestId || `req-${Date.now()}`,
      pluginId: manifest.id,
      pluginVersion: manifest.version || '0.0.0',
      configSection: manifest.id, // For useConfig() auto-detection
      routeOrCommand: handlerRef.export,
      workdir: context.cwd || process.cwd(),
      outdir: context.outdir,
      pluginRoot,
      debug: debugFlag,
      debugLevel: debugFlag ? 'verbose' : undefined,
      jsonMode: jsonModeFlag,
      // Note: traceId/spanId/parentSpanId are not on PluginContextV2
      // They will be generated in the sandbox if needed
      // Pass plugin context for presenter/ui access
      pluginContext: context as any,
      // Adapter metadata for handler-executor routing
      adapterMeta: {
        type: executionType,
        signature: executionType === 'cli' ? 'command' : executionType === 'job' ? 'job' : 'request',
        version: '1.0.0',
      },
      // Adapter context data (will be serialized for IPC)
      adapterContext: executionType === 'cli' ? {
        type: 'cli' as const,
        cwd: context.cwd || process.cwd(),
        flags: flags || {},
        argv: argv || [],
        requestId: context.requestId || `req-${Date.now()}`,
        workdir: context.cwd || process.cwd(),
        outdir: context.outdir,
        pluginId: manifest.id,
        pluginVersion: manifest.version || '0.0.0',
        debug: debugFlag,
        // Presenter facade for output - will be recreated in sandbox
        presenter: {
          write: () => {},
          error: () => {},
          info: () => {},
          json: () => {},
        },
        // Output interface stub - will be recreated in sandbox
        output: undefined as any,
      } : undefined,
      // Platform config for worker initialization
      platformConfig: (context as any).platformConfig,
    };

    // 4. Select runner mode (subprocess by default, inprocess for --debug)
    const { devMode } = selectRunnerMode(execCtx);

    if (isDebug) {
      console.error('[executePlugin] Runner mode selected', { devMode, executionType });
    }

    // 5. Create sandbox runner and execute
    const runner = nodeSubprocRunner(devMode);

    if (isDebug) {
      console.error('[executePlugin] Executing in sandbox', {
        devMode,
        hasManifest: !!manifest,
        hasPerms: !!permissions,
      });
    }

    const runResult = await runner.run({
      ctx: execCtx,
      perms: permissions,
      handler: handlerRef,
      input: { argv, flags }, // Input for CLI handlers
      manifest,
      // Brokers passed from options if available
      invokeBroker: (options as any).invokeBroker,
      artifactBroker: (options as any).artifactBroker,
      shellBroker: (options as any).shellBroker,
    });

    if (isDebug) {
      console.error('[executePlugin] Sandbox execution completed', {
        ok: runResult.ok,
        hasData: 'data' in runResult && !!runResult.data,
      });
    }

    // 6. Handle sandbox result
    if (!runResult.ok) {
      const errorDetails = runResult.error?.details || {};
      return {
        ok: false,
        error: {
          code: runResult.error?.code || 'PLUGIN_EXECUTION_ERROR',
          message: runResult.error?.message || 'Handler execution failed',
          details: {
            ...errorDetails,
            ...(runResult.error && 'stack' in runResult.error ? { stack: (runResult.error as any).stack } : {}),
          },
        },
        metrics: { timeMs: Date.now() - startedAt },
        logs: runResult.logs,
      };
    }

    const result = runResult.data;

    // 7. Validate output
    const outputValidation = await validateOutput(manifest, handlerRef, result);
    if (!outputValidation.ok) {
      return {
        ok: false,
        error: {
          code: 'PLUGIN_SCHEMA_VALIDATION_FAILED',
          message: 'Output validation failed',
          details: {
            where: 'output',
            errors: outputValidation.errors?.issues || [],
          },
        },
        metrics: { timeMs: Date.now() - startedAt },
      };
    }

    // 8. Write artifacts (if declared)
    if (context.outdir) {
      await writeArtifacts(manifest, result, context.outdir);
    }

    // 9. Return success
    if (isDebug) {
      console.error('[executePlugin] SUCCESS', { timeMs: Date.now() - startedAt });
    }
    // Merge metrics, but prefer our calculated timeMs over sandbox's
    const sandboxMetrics = runResult.metrics || {};
    return {
      ok: true,
      data: result,
      metrics: {
        ...sandboxMetrics,
        timeMs: Date.now() - startedAt, // Override with total time including validation
      },
      logs: runResult.logs,
    };
  } catch (error) {
    // Catch any errors and return structured error result
    const err = error instanceof Error ? error : new Error(String(error));

    if (isDebug) {
      console.error('[executePlugin] EXCEPTION CAUGHT', {
        message: err.message,
        stack: err.stack,
      });
    }

    return {
      ok: false,
      error: {
        code: 'PLUGIN_EXECUTION_ERROR',
        message: err.message,
        details: { stack: err.stack },
      },
      metrics: { timeMs: Date.now() - startedAt },
    };
  }
}
