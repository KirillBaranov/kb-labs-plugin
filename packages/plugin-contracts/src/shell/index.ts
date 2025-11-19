/**
 * @module @kb-labs/plugin-contracts/shell
 * Shell API type definitions with versioning support
 */

export * from './v1.js';

// Import v1 types for re-export with current version names
import type {
  ShellExecOptionsV1,
  ShellResultV1,
  ShellSpawnOptionsV1,
  ShellSpawnResultV1,
  ShellCommandSpecV1,
  ShellPermissionResultV1,
  DangerousCommandResultV1,
  ShellApiV1,
} from './v1.js';

// Export current version as default (for convenience)
// When v2 is introduced, this will be updated
export type ShellExecOptions = ShellExecOptionsV1;
export type ShellResult = ShellResultV1;
export type ShellSpawnOptions = ShellSpawnOptionsV1;
export type ShellSpawnResult = ShellSpawnResultV1;
export type ShellCommandSpec = ShellCommandSpecV1;
export type ShellPermissionResult = ShellPermissionResultV1;
export type DangerousCommandResult = DangerousCommandResultV1;
export type ShellApi = ShellApiV1;

