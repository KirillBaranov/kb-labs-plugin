/**
 * @module @kb-labs/plugin-adapter-cli/handler-new
 * Simplified handler execution using new architecture
 */

import type { ManifestV2, CliCommandDecl } from '@kb-labs/plugin-manifest';
import type { PluginRegistry } from '@kb-labs/plugin-runtime';
import { createPluginContextWithPlatform, executePlugin, CliUIFacade } from '@kb-labs/plugin-runtime';
import { createId } from '@kb-labs/plugin-runtime';
import { getLogger } from '@kb-labs/core-sys/logging';
import { createOutput, type Output } from '@kb-labs/core-sys/output';
import * as path from 'node:path';

/**
 * CLI command context (minimal - just presenter and argv)
 */
export interface CliCommandContext {
  presenter: {
    info(message: string): void;
    error(message: string): void;
    json(data: unknown): void;
    write(message: string): void;
  };
  argv?: string[];
}

/**
 * Execute CLI command with simplified architecture
 *
 * New architecture:
 * 1. Create PluginContextV2 once
 * 2. Call executePlugin() directly
 * 3. Return exit code
 */
export async function executeCommand(
  command: CliCommandDecl,
  manifest: ManifestV2,
  cliContext: CliCommandContext,
  flags: Record<string, unknown>,
  grantedCapabilities: string[],
  pluginRoot?: string,
  workdir?: string,
  outdir?: string,
  registry?: PluginRegistry
): Promise<number> {
  const requestId = createId();
  const debugFlag = flags.debug;
  const jsonMode = flags.json === true;

  // Validate pluginRoot
  if (!pluginRoot) {
    throw new Error('pluginRoot is required for CLI command execution');
  }

  const defaultWorkdir = workdir || pluginRoot;
  const defaultOutdir = outdir || path.join(defaultWorkdir, 'out');

  // Create unified Output
  const output: Output = createOutput({
    verbosity: debugFlag ? 'debug' : 'normal',
    format: jsonMode ? 'ai' : 'human',
    json: jsonMode,
    category: `plugin:${manifest.id}`,
    context: {
      plugin: manifest.id,
      command: command.id,
    },
  });

  // Create logger
  const logger = getLogger('cli:command').child({
    meta: {
      layer: 'cli',
      reqId: requestId,
      commandId: command.id,
      pluginId: manifest.id,
    },
  });

  try {
    // Determine verbosity from flags
    const verbosity = flags.quiet ? 'quiet' : (flags.verbose ? 'verbose' : 'normal');

    // 1. Create PluginContextV2 (single source of truth)
    const pluginContext = createPluginContextWithPlatform({
      host: 'cli',
      requestId,
      pluginId: manifest.id,
      pluginVersion: manifest.version,
      tenantId: process.env.KB_TENANT_ID ?? 'default',
      cwd: defaultWorkdir,
      outdir: defaultOutdir,
      config: {}, // TODO: Load product config
      ui: new CliUIFacade({
        verbosity: verbosity as 'quiet' | 'normal' | 'verbose',
        jsonMode
      }),
      metadata: {
        flags,
        jsonMode,
        debug: !!debugFlag,
        pluginRoot,
        argv: cliContext.argv || [],
      },
    });

    // 2. Parse handler reference
    const handlerRef = parseHandlerRef(command.handler);

    // 3. Execute plugin with new architecture
    // pluginRoot должен указывать на dist (скомпилированный код)
    const distRoot = path.join(pluginRoot, 'dist');

    const result = await executePlugin({
      context: pluginContext,
      handlerRef,
      argv: cliContext.argv || [],
      flags,
      manifest,
      permissions: manifest.permissions || {},
      grantedCapabilities,
      pluginRoot: distRoot,
      registry,
    });

    // 4. Handle result
    if (result.ok) {
      // Success - output result if needed
      if (jsonMode && result.data) {
        cliContext.presenter.json(result.data);
      }
      return 0; // Success exit code
    } else {
      // Error - output error message
      output.error(result.error?.message || 'Unknown error');
      if (debugFlag && result.error?.stack) {
        logger.error('Stack trace:', { stack: result.error.stack });
      }
      return 1; // Error exit code
    }
  } catch (error) {
    // Unexpected error
    const err = error instanceof Error ? error : new Error(String(error));
    output.error(`Execution failed: ${err.message}`);
    logger.error('Execution error', { error: err.message, stack: err.stack });
    return 1;
  }
}

/**
 * Parse handler reference from string format
 */
function parseHandlerRef(handlerRef: string): { file: string; export: string } {
  const [file, exportName] = handlerRef.split('#');
  if (!exportName || !file) {
    throw new Error(`Handler reference must include export name: ${handlerRef}`);
  }
  return { file, export: exportName };
}
