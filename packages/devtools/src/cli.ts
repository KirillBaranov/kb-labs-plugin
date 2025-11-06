/**
 * @module @kb-labs/plugin-devtools/cli
 * CLI commands for codegen and linting
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { generateOpenAPIFile, generateOpenAPIs, mergeOpenAPIs } from './openapi.js';
import { generateStudioRegistry } from './registry.js';
import { watchManifests } from './watch.js';
import { lintManifest } from './lint.js';
import type { CliCommand, CliContext, FlagBuilder } from '@kb-labs/cli-core';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';

/**
 * Generate OpenAPI command
 */
export function createGenerateOpenAPICommand(): CliCommand {
  return {
    name: 'dev:generate openapi',
    description: 'Generate OpenAPI spec from plugin manifest',
    registerFlags: (builder) => {
      builder({
        plugin: {
          type: 'string',
          description: 'Plugin ID (if not specified, processes all plugins)',
        },
        output: {
          type: 'string',
          alias: 'o',
          description: 'Output path (default: dist/openapi/{plugin-id}.json)',
        },
        merge: {
          type: 'boolean',
          description: 'Merge all plugin specs into one',
        },
      });
    },
    run: async (ctx: CliContext, argv: string[], flags: Record<string, unknown>) => {
      // TODO: Load manifests and generate OpenAPI
      ctx.presenter.info('Generate OpenAPI: Not yet implemented');
      return 0;
    },
  };
}

/**
 * Generate Studio registry command
 */
export function createGenerateStudioRegistryCommand(): CliCommand {
  return {
    name: 'dev:generate studio-registry',
    description: 'Generate Studio registry from plugin manifests',
    registerFlags: (builder) => {
      builder({
        output: {
          type: 'string',
          alias: 'o',
          description: 'Output path (default: dist/studio/registry.json)',
        },
        watch: {
          type: 'boolean',
          alias: 'w',
          description: 'Watch for manifest changes and regenerate',
        },
        manifests: {
          type: 'string',
          description: 'Glob pattern for manifest files (default: **/manifest.v2.ts)',
        },
      });
    },
    run: async (ctx: CliContext, argv: string[], flags: Record<string, unknown>) => {
      const outputPath = (flags.output as string) || 'dist/studio/registry.json';
      const watchMode = flags.watch as boolean | undefined;
      const manifestPattern = (flags.manifests as string) || '**/manifest.v2.ts';
      const repoRoot = ctx.repoRoot || process.cwd();

      try {
        // Find all manifest files
        const manifestFiles = await glob(manifestPattern, {
          cwd: repoRoot,
          absolute: true,
        });

        if (manifestFiles.length === 0) {
          ctx.presenter.warn(`No manifest files found matching pattern: ${manifestPattern}`);
          return 0;
        }

        // Load manifests
        const manifests: ManifestV2[] = [];
        for (const manifestPath of manifestFiles) {
          try {
            const manifestModule = await import(manifestPath);
            const manifest = manifestModule.manifest || manifestModule.default;
            if (manifest && manifest.schema === 'kb.plugin/2') {
              manifests.push(manifest);
            }
          } catch (e) {
            ctx.presenter.warn(`Failed to load manifest ${manifestPath}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        if (manifests.length === 0) {
          ctx.presenter.error('No valid manifests found');
          return 1;
        }

        // Generate registry
        await generateStudioRegistry(manifests, outputPath);
        ctx.presenter.info(`Generated registry: ${outputPath}`);

        // Watch mode
        if (watchMode) {
          ctx.presenter.info('Watching for manifest changes...');
          const cleanup = await watchManifests(manifestFiles, outputPath, (changedFiles) => {
            ctx.presenter.info(`Regenerated registry (changed: ${changedFiles.map(f => path.basename(f)).join(', ')})`);
          });

          // Keep process alive
          process.on('SIGINT', () => {
            cleanup();
            process.exit(0);
          });

          return new Promise(() => {
            // Keep running
          });
        }

        return 0;
      } catch (error) {
        ctx.presenter.error(`Failed to generate registry: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    },
  };
}

/**
 * Lint plugin command
 */
export function createLintPluginCommand(): CliCommand {
  return {
    name: 'dev:lint plugin',
    description: 'Lint plugin manifest',
    registerFlags: (builder) => {
      builder({
        manifest: {
          type: 'string',
          alias: 'm',
          description: 'Path to manifest file',
          required: true,
        },
        strict: {
          type: 'boolean',
          description: 'Treat warnings as errors',
        },
      });
    },
    run: async (ctx: CliContext, argv: string[], flags: Record<string, unknown>) => {
      const manifestPath = flags.manifest as string;
      const strict = flags.strict as boolean | undefined;

      try {
        // Load manifest
        const manifestModule = await import(manifestPath);
        const manifest: ManifestV2 = manifestModule.default || manifestModule.manifest;

        // Lint manifest
        const result = await lintManifest(manifest, ctx.repoRoot || process.cwd());

        // Print results
        if (result.errors.length > 0) {
          ctx.presenter.error(`Found ${result.errors.length} errors:`);
          for (const error of result.errors) {
            ctx.presenter.error(`  ${error.location || 'unknown'}: ${error.message}`);
          }
          return 1;
        }

        if (result.warnings.length > 0) {
          ctx.presenter.warn(`Found ${result.warnings.length} warnings:`);
          for (const warning of result.warnings) {
            ctx.presenter.warn(`  ${warning.location || 'unknown'}: ${warning.message}`);
          }
          if (strict) {
            return 1;
          }
        }

        ctx.presenter.info('Manifest linting passed');
        return 0;
      } catch (error) {
        ctx.presenter.error(`Failed to lint manifest: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
      }
    },
  };
}

/**
 * Register all devtools commands
 */
export function registerDevtoolsCommands(registry: CliCommand[]): void {
  registry.push(
    createGenerateOpenAPICommand(),
    createGenerateStudioRegistryCommand(),
    createLintPluginCommand()
  );
}
