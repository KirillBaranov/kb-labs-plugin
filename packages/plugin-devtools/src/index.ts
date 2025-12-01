/**
 * @module @kb-labs/plugin-devtools
 * Development tools for Plugin Model v2
 */

// OpenAPI codegen
export {
  generateOpenAPIFile,
  generateOpenAPIs,
  mergeOpenAPIs,
} from './openapi';
// Re-export with shorter name for convenience
export { generateOpenAPIFile as generateOpenAPI } from './openapi';

// Studio registry codegen
export {
  generateStudioRegistry,
} from './registry';

// Studio registry watcher
export {
  watchManifests,
} from './watch';

// Linting
export {
  lintManifest,
  type LintResult,
  type LintError,
} from './lint';

// CLI commands
export {
  createGenerateOpenAPICommand,
  createGenerateStudioRegistryCommand,
  createLintPluginCommand,
  registerDevtoolsCommands,
} from './cli';
