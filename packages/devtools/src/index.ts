/**
 * @module @kb-labs/plugin-devtools
 * Development tools for Plugin Model v2
 */

// OpenAPI codegen
export {
  generateOpenAPIFile,
  generateOpenAPIs,
  mergeOpenAPIs,
} from './openapi.js';
// Re-export with shorter name for convenience
export { generateOpenAPIFile as generateOpenAPI } from './openapi.js';

// Studio registry codegen
export {
  generateStudioRegistry,
} from './registry.js';

// Studio registry watcher
export {
  watchManifests,
} from './watch.js';

// Linting
export {
  lintManifest,
  type LintResult,
  type LintError,
} from './lint.js';

// CLI commands
export {
  createGenerateOpenAPICommand,
  createGenerateStudioRegistryCommand,
  createLintPluginCommand,
  registerDevtoolsCommands,
} from './cli.js';
