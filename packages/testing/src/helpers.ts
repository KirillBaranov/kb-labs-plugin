/**
 * Testing utilities for plugins with type safety
 * @module @kb-labs/plugin-testing
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { PluginContracts } from '@kb-labs/plugin-template-contracts';
import type { CommandResult } from '@kb-labs/cli-command-kit';
import type { EnhancedCliContext } from '@kb-labs/cli-command-kit';
import { z } from 'zod';

/**
 * Mock logger for testing
 */
function createMockLogger() {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  };
}

/**
 * Mock tracker for testing
 */
function createMockTracker() {
  return {
    checkpoint: () => {},
    total: () => 0,
  };
}

/**
 * Mock output for testing
 */
function createMockOutput() {
  const messages: string[] = [];
  return {
    write: (msg: string) => {
      messages.push(msg);
    },
    error: (msg: string) => {
      messages.push(`ERROR: ${msg}`);
    },
    success: (msg: string) => {
      messages.push(`SUCCESS: ${msg}`);
    },
    json: (data: unknown) => {
      messages.push(JSON.stringify(data, null, 2));
    },
    getMessages: () => messages,
  };
}

/**
 * Create a typed mock context for testing
 * 
 * @example
 * const ctx = createMockContext(pluginContractsManifest, {
 *   logger: customLogger
 * });
 */
export function createMockContext<TContracts extends PluginContracts>(
  contracts: TContracts,
  overrides?: Partial<EnhancedCliContext>
): EnhancedCliContext {
  return {
    logger: createMockLogger(),
    tracker: createMockTracker(),
    output: createMockOutput(),
    ...overrides,
  } as EnhancedCliContext;
}

/**
 * Test command with type safety
 * 
 * @example
 * const result = await testCommand(myCommand, { name: 'World' });
 * expect(result.ok).toBe(true);
 */
export async function testCommand<TFlags, TResult extends CommandResult>(
  command: {
    handler: (
      ctx: EnhancedCliContext,
      argv: string[],
      flags: TFlags
    ) => Promise<TResult> | TResult;
  },
  flags: TFlags,
  ctx?: Partial<EnhancedCliContext>
): Promise<TResult> {
  const mockCtx = createMockContext({} as PluginContracts, ctx);
  return await command.handler(mockCtx, [], flags);
}

/**
 * Assert command result matches Zod schema
 * 
 * @example
 * assertCommandResult(result, HelloCommandOutputSchema);
 */
export function assertCommandResult<TResult extends CommandResult>(
  result: TResult,
  schema: z.ZodSchema<TResult>
): asserts result is TResult {
  const validation = schema.safeParse(result);
  if (!validation.success) {
    const errors = validation.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    throw new Error(`Command result does not match schema: ${errors}`);
  }
}

/**
 * Create typed test suite for a plugin
 * 
 * @example
 * const suite = createPluginTestSuite(pluginContractsManifest, manifest);
 * 
 * suite.testCommand('template:hello', { name: 'World' });
 * suite.testManifest();
 */
export function createPluginTestSuite<TContracts extends PluginContracts>(
  contracts: TContracts,
  manifest: ManifestV2
) {
  return {
    /**
     * Test a command by ID
     */
    testCommand: async <TFlags, TResult extends CommandResult>(
      commandId: keyof TContracts['commands'],
      flags: TFlags
    ): Promise<TResult> => {
      // Find command in manifest
      const cmdDecl = manifest.cli?.commands.find((c) => c.id === String(commandId));
      if (!cmdDecl) {
        throw new Error(`Command ${String(commandId)} not found in manifest`);
      }

      // Import command handler
      const [handlerPath, exportName] = cmdDecl.handler.split('#');
      const handlerModule = await import(handlerPath);
      const handler = handlerModule[exportName || 'run'];

      if (!handler) {
        throw new Error(`Handler ${exportName || 'run'} not found in ${handlerPath}`);
      }

      const ctx = createMockContext(contracts);
      return await handler(ctx, [], flags);
    },

    /**
     * Test manifest validation
     */
    testManifest: () => {
      // Basic validation - can be extended
      const issues: string[] = [];

      // Check artifact IDs
      if (manifest.artifacts) {
        const contractArtifacts = contracts.artifacts || {};
        for (const artifact of manifest.artifacts) {
          if (!(artifact.id in contractArtifacts)) {
            issues.push(`Artifact ID "${artifact.id}" not found in contracts`);
          }
        }
      }

      // Check command IDs
      if (manifest.cli?.commands) {
        const contractCommands = contracts.commands || {};
        for (const cmd of manifest.cli.commands) {
          if (!(cmd.id in contractCommands)) {
            issues.push(`Command ID "${cmd.id}" not found in contracts`);
          }
        }
      }

      return {
        ok: issues.length === 0,
        issues,
      };
    },

    /**
     * Test artifacts generation
     */
    testArtifacts: async () => {
      // Placeholder for artifact testing
      return {
        ok: true,
        artifacts: [],
      };
    },
  };
}

