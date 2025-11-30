/**
 * Migration helpers for upgrading plugins between typing levels
 * @module @kb-labs/plugin-manifest/migration
 */

import type { ManifestV2, ArtifactDecl, CliCommandDecl } from './types';

/**
 * Minimal PluginContracts interface for migration helpers
 * Full type is defined in @kb-labs/plugin-template-contracts
 */
import type { SchemaRef } from './types';

/**
 * Minimal PluginContracts interface for migration helpers
 * Full type is defined in @kb-labs/plugin-template-contracts
 */
interface PluginContracts {
  schema: string;
  pluginId: string;
  contractsVersion: string;
  artifacts?: Record<string, { id: string; kind: string; pathPattern: string; description?: string; schemaRef?: SchemaRef }>;
  commands?: Record<string, { id: string; description?: string; examples?: string[] }>;
  workflows?: Record<string, unknown>;
  api?: {
    rest?: {
      routes?: Record<string, { id: string; method: string; path: string; description?: string }>;
    };
  };
}

/**
 * Migrate from plain manifest to createManifestV2 (Level 0 → Level 1)
 * 
 * @example
 * const code = migrateToCreateManifest(manifest);
 * // Returns: "import { createManifestV2 } from '@kb-labs/plugin-manifest';\n\nexport const manifest = createManifestV2({...});"
 */
export function migrateToCreateManifest(manifest: ManifestV2): string {
  const manifestJson = JSON.stringify(manifest, null, 2);
  return `import { createManifestV2 } from '@kb-labs/plugin-manifest';\n\n` +
         `export const manifest = createManifestV2(${manifestJson});`;
}

/**
 * Extract contracts from manifest (Level 1 → Level 2)
 * 
 * @example
 * const contracts = extractContractsFromManifest(manifest);
 * // Returns PluginContracts object that can be used with createManifestV2<typeof contracts>()
 */
export function extractContractsFromManifest(manifest: ManifestV2): Partial<PluginContracts> {
  const contracts: Partial<PluginContracts> = {
    schema: 'kb.plugin.contracts/1' as const,
    pluginId: manifest.id,
    contractsVersion: manifest.version,
    artifacts: {},
    commands: {},
    workflows: {},
  };

  // Extract artifacts
  if (manifest.artifacts) {
    for (const artifact of manifest.artifacts) {
      contracts.artifacts![artifact.id] = {
        id: artifact.id,
        kind: 'json', // default, should be inferred from pathTemplate or schemaRef
        pathPattern: artifact.pathTemplate,
        description: artifact.description,
        schemaRef: artifact.schemaRef,
      };
    }
  }

  // Extract commands
  if (manifest.cli?.commands) {
    contracts.commands = {};
    for (const cmd of manifest.cli.commands) {
      contracts.commands![cmd.id] = {
        id: cmd.id,
        description: cmd.describe,
        examples: cmd.examples || [],
      };
    }
  }

  // Extract workflows (if any)
  // Note: Workflows are not directly in manifest, but can be inferred from commands

  return contracts;
}

/**
 * Generate Zod schema templates from contracts (Level 2 → Level 3)
 * 
 * @example
 * const schemas = generateZodSchemasFromContracts(contracts);
 * // Returns TypeScript code with Zod schema templates
 */
export function generateZodSchemasFromContracts(contracts: Partial<PluginContracts>): string {
  let output = `import { z } from 'zod';\n\n`;

  // Generate schemas for commands
  if (contracts.commands) {
    const commands = contracts.commands;
    for (const [id, cmd] of Object.entries(commands)) {
      const typedCmd = cmd as { description?: string };
      const name = id.replace(/[:-]/g, '_').replace(/\./g, '_');
      const pascalName = name
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');

      output += `/**\n`;
      output += ` * Input schema for ${id}\n`;
      if (typedCmd.description) {
        output += ` * ${typedCmd.description}\n`;
      }
      output += ` */\n`;
      output += `export const ${pascalName}InputSchema = z.object({\n`;
      output += `  // TODO: Define input schema based on command flags\n`;
      output += `  // Example:\n`;
      output += `  // name: z.string().optional(),\n`;
      output += `});\n\n`;

      output += `/**\n`;
      output += ` * Output schema for ${id}\n`;
      output += ` */\n`;
      output += `export const ${pascalName}OutputSchema = z.object({\n`;
      output += `  ok: z.boolean(),\n`;
      output += `  // TODO: Define output schema\n`;
      output += `});\n\n`;

      output += `export type ${pascalName}Input = z.infer<typeof ${pascalName}InputSchema>;\n`;
      output += `export type ${pascalName}Output = z.infer<typeof ${pascalName}OutputSchema>;\n\n`;
    }
  }

  // Generate schemas for REST routes
  if (contracts.api?.rest?.routes) {
    const routes = contracts.api.rest.routes;
    for (const [id, route] of Object.entries(routes)) {
      const typedRoute = route as { method: string; path: string; description?: string };
      const name = id.replace(/[:-]/g, '_').replace(/\./g, '_');
      const pascalName = name
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join('');

      output += `/**\n`;
      output += ` * Request schema for ${typedRoute.method} ${typedRoute.path}\n`;
      if (typedRoute.description) {
        output += ` * ${typedRoute.description}\n`;
      }
      output += ` */\n`;
      output += `export const ${pascalName}RequestSchema = z.object({\n`;
      output += `  // TODO: Define request schema\n`;
      output += `});\n\n`;

      output += `/**\n`;
      output += ` * Response schema for ${typedRoute.method} ${typedRoute.path}\n`;
      output += ` */\n`;
      output += `export const ${pascalName}ResponseSchema = z.object({\n`;
      output += `  // TODO: Define response schema\n`;
      output += `});\n\n`;

      output += `export type ${pascalName}Request = z.infer<typeof ${pascalName}RequestSchema>;\n`;
      output += `export type ${pascalName}Response = z.infer<typeof ${pascalName}ResponseSchema>;\n\n`;
    }
  }

  return output;
}

/**
 * Generate contract file from manifest (Level 1 → Level 2)
 * 
 * @example
 * const contractCode = generateContractFile(manifest);
 * // Returns complete contract.ts file content
 */
export function generateContractFile(manifest: ManifestV2): string {
  const contracts = extractContractsFromManifest(manifest);
  const contractsJson = JSON.stringify(contracts, null, 2);

  return `import type { PluginContracts } from './types';\n` +
         `import { contractsSchemaId, contractsVersion } from './version';\n\n` +
         `export const pluginContractsManifest = ${contractsJson} as const satisfies PluginContracts;\n\n` +
         `// Извлекаем типы для использования в других местах\n` +
         `export type PluginArtifactIds = keyof typeof pluginContractsManifest.artifacts;\n` +
         `export type PluginCommandIds = keyof typeof pluginContractsManifest.commands;\n` +
         `export type PluginWorkflowIds = keyof typeof pluginContractsManifest.workflows;\n` +
         `export type PluginRouteIds = typeof pluginContractsManifest.api extends { rest: { routes: infer R } }\n` +
         `  ? R extends Record<string, any> ? keyof R : never\n` +
         `  : never;\n`;
}

