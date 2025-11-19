/**
 * @module @kb-labs/plugin-contracts/shell/v1
 * Shell API v1 type definitions
 * 
 * Versioning policy:
 * - MAJOR: Breaking changes in API (e.g., removing methods, changing signatures)
 * - MINOR: New fields added (backward compatible)
 * - PATCH: Type corrections, documentation updates
 */

/**
 * Shell execution options
 */
export interface ShellExecOptionsV1 {
  /** Working directory for command execution */
  cwd?: string;
  /** Environment variables (whitelisted, merged with parent env) */
  env?: Record<string, string>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Shell execution result
 */
export interface ShellResultV1 {
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
  /** Error details if execution failed (runtime-specific, not part of contract) */
  error?: unknown;
}

/**
 * Shell spawn options
 */
export interface ShellSpawnOptionsV1 extends ShellExecOptionsV1 {
  /** Standard I/O mode */
  stdio?: 'inherit' | 'pipe' | 'ignore';
}

/**
 * Shell spawn result
 */
export interface ShellSpawnResultV1 {
  /** Process ID */
  pid: number;
  /** Promise that resolves when process completes */
  promise: Promise<ShellResultV1>;
  /** Kill the process */
  kill: (signal?: string) => void;
}

/**
 * Shell command specification for permission checking
 */
export interface ShellCommandSpecV1 {
  /** Command name */
  command: string;
  /** Command arguments */
  args: string[];
}

/**
 * Permission check result
 */
export interface ShellPermissionResultV1 {
  /** Whether command is allowed */
  allow: boolean;
  /** Reason for denial (if not allowed) */
  reason?: string;
  /** Remediation suggestion */
  remediation?: string;
}

/**
 * Dangerous command check result
 */
export interface DangerousCommandResultV1 {
  /** Whether command is dangerous */
  dangerous: boolean;
  /** Reason why it's dangerous */
  reason?: string;
  /** Whether confirmation is required */
  requireConfirmation: boolean;
}

/**
 * Shell API v1 interface
 * Provides safe command execution with permission checks
 */
export interface ShellApiV1 {
  /**
   * Execute a shell command and wait for completion
   * @param command - Command name (e.g., 'tsc', 'npm')
   * @param args - Command arguments (e.g., ['--version', '--noEmit'])
   * @param options - Execution options (cwd, env, timeout, signal)
   * @returns Promise resolving to execution result
   */
  exec(
    command: string,
    args: string[],
    options?: ShellExecOptionsV1
  ): Promise<ShellResultV1>;

  /**
   * Spawn a shell command for long-running processes
   * @param command - Command name
   * @param args - Command arguments
   * @param options - Spawn options (cwd, env, timeout, signal, stdio)
   * @returns Spawn result with pid, promise, and kill method
   */
  spawn(
    command: string,
    args: string[],
    options?: ShellSpawnOptionsV1
  ): Promise<ShellSpawnResultV1>;
}

