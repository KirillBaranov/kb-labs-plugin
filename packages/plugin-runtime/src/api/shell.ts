/**
 * Shell API implementation
 */

import { spawn } from 'node:child_process';
import type { ShellAPI, ExecResult, ExecOptions, PermissionSpec } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';

/**
 * Commands that are always blocked (dangerous)
 */
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd if=',
  ':(){:|:&};:', // Fork bomb
  'chmod -R 777 /',
  'chown -R',
  '> /dev/sda',
  'mv /* ',
];

export interface CreateShellAPIOptions {
  permissions: PermissionSpec;
  cwd: string;
}

/**
 * Create ShellAPI with permission checks
 */
export function createShellAPI(options: CreateShellAPIOptions): ShellAPI {
  const { permissions, cwd } = options;

  // Check if shell is allowed
  if (!permissions.shell?.allowed) {
    return {
      async exec(): Promise<never> {
        throw new PermissionError('Shell execution not allowed');
      },
    };
  }

  const allowedCommands = permissions.shell.commands ?? [];

  return {
    async exec(
      command: string,
      args: string[] = [],
      execOptions?: ExecOptions
    ): Promise<ExecResult> {
      // Check blocked commands
      const fullCommand = `${command} ${args.join(' ')}`;
      for (const blocked of BLOCKED_COMMANDS) {
        if (fullCommand.includes(blocked)) {
          throw new PermissionError(`Dangerous command blocked`, {
            command: fullCommand,
            blocked,
          });
        }
      }

      // Check command whitelist (if specified)
      if (allowedCommands.length > 0 && !allowedCommands.includes(command)) {
        throw new PermissionError(`Command not in whitelist`, {
          command,
          allowedCommands,
        });
      }

      const workingDir = execOptions?.cwd ?? cwd;
      const timeout = execOptions?.timeout ?? 30000;
      const throwOnError = execOptions?.throwOnError ?? false;

      return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: workingDir,
          shell: true,
          env: {
            ...process.env,
            ...execOptions?.env,
          },
        });

        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timeoutId = setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, timeout);

        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('close', (code) => {
          clearTimeout(timeoutId);

          if (timedOut) {
            reject(new Error(`Command timed out after ${timeout}ms`));
            return;
          }

          const exitCode = code ?? 0;
          const result: ExecResult = {
            code: exitCode,
            stdout,
            stderr,
            ok: exitCode === 0,
          };

          if (throwOnError && exitCode !== 0) {
            reject(new Error(`Command failed with code ${exitCode}: ${stderr}`));
          } else {
            resolve(result);
          }
        });

        child.on('error', (error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
      });
    },
  };
}
