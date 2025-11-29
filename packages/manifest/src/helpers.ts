/**
 * Helper functions for creating and validating manifests
 * @module @kb-labs/plugin-manifest/helpers
 */

import type { ManifestV2, ArtifactDecl, CliCommandDecl } from './types.js';
import { manifestV2Schema, type ValidationResult } from './schema.js';

/**
 * Extract artifact IDs from contracts type
 */
type ExtractArtifactIds<TContracts> = TContracts extends { artifacts: infer A }
  ? A extends Record<string, any>
    ? keyof A
    : never
  : string;

/**
 * Extract command IDs from contracts type
 */
type ExtractCommandIds<TContracts> = TContracts extends { commands: infer C }
  ? C extends Record<string, any>
    ? keyof C
    : never
  : string;

/**
 * Typed manifest with contracts validation
 */
type TypedManifestV2<TContracts = unknown> = Omit<ManifestV2, 'artifacts' | 'cli'> & {
  artifacts?: Array<
    Omit<ArtifactDecl, 'id'> & {
      id: TContracts extends { artifacts: Record<string, any> }
        ? ExtractArtifactIds<TContracts>
        : string;
    }
  >;
  cli?: {
    commands: Array<
      Omit<CliCommandDecl, 'id'> & {
        id: TContracts extends { commands: Record<string, any> }
          ? ExtractCommandIds<TContracts>
          : string;
      }
    >;
  };
} & Pick<ManifestV2, 'rest' | 'studio' | 'setup' | 'permissions' | 'capabilities' | 'display' | 'dependencies' | 'lifecycle' | 'headers'>;

/**
 * Format validation errors for better DX
 */
function formatValidationErrors(errors: Array<{ path: (string | number)[]; message: string }>): string {
  const formatted = errors.map((error) => {
    const path = error.path.length > 0 ? error.path.join('.') : 'root';
    return `  ${path}: ${error.message}`;
  });
  return formatted.join('\n');
}

/**
 * Create a ManifestV2 with optional contracts validation
 *
 * @example
 * // Базовое использование (без contracts) - Level 1
 * const manifest = createManifestV2({
 *   schema: 'kb.plugin/2',
 *   id: '@kb-labs/my-plugin',
 *   version: '1.0.0',
 *   // ... остальные поля
 * });
 *
 * @example
 * // С типизацией contracts - Level 2
 * import type { PluginContracts } from '@kb-labs/my-plugin-contracts';
 *
 * const manifest = createManifestV2<typeof pluginContractsManifest>({
 *   schema: 'kb.plugin/2',
 *   id: '@kb-labs/my-plugin',
 *   version: '1.0.0',
 *   artifacts: [
 *     { id: 'my.artifact.id' } // ✅ Проверяется против contracts
 *   ],
 *   cli: {
 *     commands: [{
 *       id: 'my:command', // ✅ Проверяется против contracts
 *       // ...
 *     }]
 *   }
 * });
 *
 * @param manifest - Manifest configuration with optional contracts typing
 * @returns Validated ManifestV2
 * @throws Error if manifest validation fails
 */
export function createManifestV2<TContracts = unknown>(
  manifest: TypedManifestV2<TContracts>
): ManifestV2 {
  // Runtime валидация через Zod
  const result = manifestV2Schema.safeParse(manifest);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path as (string | number)[],
      message: issue.message,
    }));

    const formattedErrors = formatValidationErrors(errors);
    const errorMessage = `Invalid manifest:\n${formattedErrors}\n\nSee: https://docs.kb-labs.dev/plugins/manifest`;

    throw new Error(errorMessage);
  }

  return result.data;
}

/**
 * Type helper to extract artifact IDs from contracts
 */
export type ExtractArtifactIdsFromContracts<TContracts> = ExtractArtifactIds<TContracts>;

/**
 * Type helper to extract command IDs from contracts
 */
export type ExtractCommandIdsFromContracts<TContracts> = ExtractCommandIds<TContracts>;

/**
 * Flag schema definition (compatible with @kb-labs/cli-command-kit)
 */
type FlagSchemaDefinition = Record<
  string,
  {
    type: 'string' | 'boolean' | 'number' | 'array';
    alias?: string;
    default?: unknown;
    description?: string;
    choices?: string[];
    required?: boolean;
  }
>;

/**
 * Convert flag schema definition to CliFlagDecl[] for manifest
 *
 * @example
 * const helloFlags = {
 *   name: { type: 'string', description: 'Name to greet', alias: 'n' },
 *   json: { type: 'boolean', description: 'Emit JSON', default: false }
 * };
 *
 * const manifestFlags = defineCommandFlags(helloFlags);
 * // Use in manifest: flags: manifestFlags
 */
export function defineCommandFlags<TFlags extends FlagSchemaDefinition>(
  flags: TFlags
): Array<{
  name: string;
  type: 'string' | 'boolean' | 'number' | 'array';
  alias?: string;
  default?: unknown;
  description?: string;
  choices?: string[];
  required?: boolean;
}> {
  return Object.entries(flags).map(([name, flag]) => ({
    name,
    type: flag.type,
    ...(flag.alias !== undefined && { alias: flag.alias }),
    ...(flag.default !== undefined && { default: flag.default }),
    ...(flag.description !== undefined && { description: flag.description }),
    ...(flag.choices !== undefined && { choices: flag.choices }),
    ...(flag.required !== undefined && { required: flag.required }),
  }));
}

/**
 * Export example generation utilities
 */
export {
  generateExamples,
  exampleBuilder,
  type ExampleTemplate,
  ExampleBuilder,
} from './example-generator.js';
