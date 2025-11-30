/**
 * @module @kb-labs/plugin-manifest/migrate
 * V1→V2 migration utilities
 */

import type {
  ManifestV1,
  ManifestV2,
  CliCommandDecl,
  CliFlagDecl,
} from './types';

/**
 * Migrate Manifest v1 to v2
 */
export function migrateV1ToV2(v1: ManifestV1): ManifestV2 {
  const commands: CliCommandDecl[] = v1.commands.map((cmd) => {
    const flags: CliFlagDecl[] = (cmd.flags || []).map((flag) => ({
      name: flag.name,
      type: flag.type,
      alias: flag.alias,
      default: flag.default,
      description: flag.description,
      choices: flag.choices,
      required: flag.required,
    }));

    const command: CliCommandDecl = {
      id: cmd.id,
      group: cmd.group,
      describe: cmd.describe,
      longDescription: cmd.longDescription,
      flags,
      examples: cmd.examples,
      handler: '', // Will be resolved from loader
    };

    // Convert loader to handler reference
    // This is a placeholder - actual handler resolution happens at runtime
    // The loader function signature is preserved but converted to string reference
    // Since loader is a function, we can't extract path from it directly
    // For now, use a convention: './commands/{command-name}.js#run'
    const handlerName = cmd.id.split(':').pop() || 'run';
    command.handler = `./cli/${handlerName}.ts#run`;

    return command;
  });

  // Extract plugin ID from first command's group or id
  const pluginId =
    commands[0]?.group || commands[0]?.id.split(':')[0] || 'unknown';

  const manifest: ManifestV2 = {
    schema: 'kb.plugin/2',
    id: pluginId,
    version: '1.0.0', // Default version - should be updated from package.json
    display: {
      name: pluginId,
      description: commands[0]?.describe,
    },
    cli: {
      commands,
    },
  };

  return manifest;
}
