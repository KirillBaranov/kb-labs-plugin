/**
 * @module @kb-labs/plugin-adapter-cli/register
 * Command registration from manifest
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { CliCommand, CliContext, FlagBuilder } from '@kb-labs/cli-core';
import { registerFlags } from './flags.js';
import { executeCommand } from './handler.js';
import type { ExecutionContext } from '@kb-labs/plugin-runtime';

/**
 * Runtime interface for plugin execution
 */
export interface PluginRuntime {
  execute<I, O>(
    handlerRef: string,
    input: I,
    context: ExecutionContext
  ): Promise<{ success: boolean; data?: O; error?: unknown }>;
  checkCapabilities(
    required: string[],
    granted: string[]
  ): { granted: boolean; missing: string[] };
}

/**
 * Command registration options
 */
export interface RegisterOptions {
  /** Granted capabilities */
  grantedCapabilities?: string[];
  /** Exit code policy */
  exitPolicy?: 'none' | 'major' | 'critical';
  /** Debug mode */
  debug?: boolean;
  /** CLI context provider */
  getContext: () => import('@kb-labs/cli-core').CliContext;
  /** Plugin root directory (for module resolution) */
  pluginRoot?: string;
  /** Working directory */
  workdir?: string;
  /** Output directory */
  outdir?: string;
}

/**
 * Register commands from manifest
 */
export async function registerCommands(
  manifest: ManifestV2,
  registry: CliCommand[],
  options: RegisterOptions
): Promise<void> {
  if (!manifest.cli?.commands) {
    return;
  }

  const grantedCapabilities = options.grantedCapabilities || [];
  const { getContext, debug } = options;

  for (const commandDecl of manifest.cli.commands) {
    const command: CliCommand = {
      name: commandDecl.id.replace(':', '.'),
      description: commandDecl.describe,
      registerFlags: (builder: FlagBuilder) => {
        registerFlags(commandDecl.flags, builder);
      },
      run: async (ctx: CliContext, argv: string[], flags: Record<string, unknown>) => {
        if (debug) {
          // Print debug info
          ctx.presenter.info(`[${manifest.id}] Executing command: ${commandDecl.id}`);
          ctx.presenter.info(`[${manifest.id}] Plugin version: ${manifest.version}`);
          ctx.presenter.info(`[${manifest.id}] Granted capabilities: ${grantedCapabilities.join(', ')}`);
          if (manifest.capabilities) {
            ctx.presenter.info(`[${manifest.id}] Required capabilities: ${manifest.capabilities.join(', ')}`);
          }
        }

        return executeCommand(
          commandDecl,
          manifest,
          ctx,
          flags,
          grantedCapabilities,
          options.pluginRoot,
          options.workdir,
          options.outdir
        );
      },
    };

    registry.push(command);
  }
}
