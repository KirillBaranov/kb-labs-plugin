/**
 * @module @kb-labs/plugin-adapter-cli
 * CLI adapter for Plugin Model v2
 */

// Registration
export {
  registerCommands,
  type RegisterOptions,
  type PluginRuntime,
} from './register';

// Flags
export { registerFlags, mapFlag } from './flags';

// Handler
export { executeCommand } from './handler';

// Errors
export { printErrorEnvelope, mapErrorToExitCode } from './errors';

// Debug
export { printDebugInfo } from './debug';

// Logging utilities removed - use @kb-labs/core-sys/logging directly
// import { getLogger } from '@kb-labs/core-sys/logging';
