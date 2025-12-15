/**
 * @module @kb-labs/plugin-runtime/execute-plugin
 * Simplified plugin execution - all logic in one place
 *
 * @see ADR-0015: Execution Adapters Architecture
 */

import type { ExecutePluginOptions, ExecutePluginResult } from './types';
import { checkCapabilities } from './capabilities';
import { loadHandler } from './loader';
import { validateInput, validateOutput } from './validation';
import { writeArtifacts } from './artifacts';
import { getAdapter } from './adapters/index.js';

/**
 * Execute plugin command with full validation and error handling
 *
 * This is the SINGLE PLACE for all plugin execution logic:
 * - Capability checking
 * - Input/output validation
 * - Handler loading and invocation
 * - Artifact writing
 * - Error handling
 * - Profiling
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

  // Debug logging
  if (process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG) {
    console.error('[executePlugin] START', {
      manifestId: manifest.id,
      handlerRef,
      pluginRoot,
      hasContext: !!context,
      contextType: context?.constructor?.name,
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
    if (process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG) {
      console.error('[executePlugin] Validating input');
    }
    const inputValidation = await validateInput(manifest, handlerRef, flags);
    if (!inputValidation.ok) {
      if (process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG) {
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

    // 3. Load handler module
    if (process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG) {
      console.error('[executePlugin] Loading handler', { handlerRef, pluginRoot });
    }
    const handlerFn = await loadHandler(handlerRef, pluginRoot);

    // 4. Execute handler via adapter
    // Adapter pattern allows different handler signatures (CLI, Job, REST)
    // @see ADR-0015: Execution Adapters Architecture
    const executionType = options.executionType ?? 'cli';
    const adapter = getAdapter(executionType);

    if (process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG) {
      console.error('[executePlugin] Executing handler', { executionType });
    }

    const adapterInput = adapter.prepareInput(options);
    const result = await adapter.invoke(handlerFn, adapterInput, context);

    if (process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG) {
      console.error('[executePlugin] Handler executed successfully', { hasResult: !!result });
    }

    // 5. Validate output
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

    // 6. Write artifacts (if declared)
    if (context.outdir) {
      await writeArtifacts(manifest, result, context.outdir);
    }

    // 7. Return success
    if (process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG) {
      console.error('[executePlugin] SUCCESS', { timeMs: Date.now() - startedAt });
    }
    return {
      ok: true,
      data: result,
      metrics: { timeMs: Date.now() - startedAt },
    };
  } catch (error) {
    // Catch any errors and return structured error result
    const err = error instanceof Error ? error : new Error(String(error));

    if (process.env.KB_LOG_LEVEL === 'debug' || process.env.DEBUG) {
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
        stack: err.stack,
      },
      metrics: { timeMs: Date.now() - startedAt },
    };
  }
}
