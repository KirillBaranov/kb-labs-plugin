/**
 * @module @kb-labs/plugin-runtime/shell/types
 * Types for shell execution
 * 
 * @deprecated Import from @kb-labs/plugin-contracts instead
 * This file is kept for backward compatibility and re-exports from contracts
 */

import type { ErrorEnvelope } from '../types';
import type {
  ShellExecOptions as ShellExecOptionsContract,
  ShellResult as ShellResultContract,
  ShellSpawnOptions as ShellSpawnOptionsContract,
  ShellSpawnResult as ShellSpawnResultContract,
  ShellCommandSpec as ShellCommandSpecContract,
  ShellPermissionResult as ShellPermissionResultContract,
  DangerousCommandResult as DangerousCommandResultContract,
} from '@kb-labs/plugin-contracts';

// Re-export from contracts
export type {
  ShellExecOptionsContract as ShellExecOptions,
  ShellSpawnOptionsContract as ShellSpawnOptions,
  ShellCommandSpecContract as ShellCommandSpec,
  ShellPermissionResultContract as ShellPermissionResult,
  DangerousCommandResultContract as DangerousCommandResult,
};

// Extend ShellResult to include ErrorEnvelope (runtime-specific)
export interface ShellResult {
  /** Whether command succeeded (exitCode === 0) */
  ok: boolean;
  /** Process exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution time in milliseconds */
  timingMs: number;
  /** Error envelope if execution failed (runtime-specific extension) */
  error?: ErrorEnvelope;
}

// Extend ShellSpawnResult to use extended ShellResult
export interface ShellSpawnResult extends Omit<ShellSpawnResultContract, 'promise'> {
  /** Promise that resolves when process completes */
  promise: Promise<ShellResult>;
}

