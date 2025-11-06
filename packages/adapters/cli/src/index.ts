/**
 * @module @kb-labs/plugin-adapter-cli
 * CLI adapter for Plugin Model v2
 */

// Registration
export {
  registerCommands,
  type RegisterOptions,
  type PluginRuntime,
} from './register.js';

// Flags
export { registerFlags, mapFlag } from './flags.js';

// Handler
export { executeCommand } from './handler.js';

// Errors
export { printErrorEnvelope, mapErrorToExitCode } from './errors.js';

// Debug
export { printDebugInfo } from './debug.js';
