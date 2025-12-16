/**
 * @module @kb-labs/plugin-runtime-v3/__tests__/e2e-context
 *
 * E2E tests for V3 plugin context structure.
 *
 * These tests run actual CLI commands and verify the context structure
 * in a real execution environment (subprocess).
 */

import { describe, it, expect } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

describe('V3 Context E2E', () => {
  it('should provide complete context in real CLI execution', async () => {
    // Run the actual V3 command with KB_PLUGIN_VERSION=3
    // This tests the FULL pipeline: CLI → V3 adapter → subprocess → handler

    const { stdout, stderr } = await execAsync(
      'KB_PLUGIN_VERSION=3 pnpm kb plugin-template:hello-v3 --name="E2E-Test"',
      {
        cwd: '/Users/kirillbaranov/Desktop/kb-labs',
        env: {
          ...process.env,
          KB_PLUGIN_VERSION: '3',
        },
        timeout: 30000,
      }
    );

    // Check that command executed successfully
    expect(stderr).not.toContain('Error');
    expect(stdout).toContain('[V3] Hello, E2E-Test!');

    // Parse debug output to verify structure
    expect(stdout).toContain('=== V3 CONTEXT DEBUG ===');

    // Extract structure from debug output
    const contextBlock = stdout.match(/=== V3 CONTEXT DEBUG ===\n([\s\S]+?)\n=== END CONTEXT DEBUG ===/);
    expect(contextBlock).toBeDefined();

    const debugOutput = contextBlock![1];

    // Verify metadata fields
    expect(debugOutput).toContain('host: cli');
    expect(debugOutput).toContain('pluginId: @kb-labs/plugin-template');
    expect(debugOutput).toContain('pluginVersion: 0.1.0');
    expect(debugOutput).toContain('cwd: /Users/kirillbaranov/Desktop/kb-labs');

    // Verify signal
    expect(debugOutput).toContain('signal: AbortSignal present');

    // Verify UI methods (13 total)
    expect(debugOutput).toContain('ui methods:');
    expect(debugOutput).toContain('\'info\'');
    expect(debugOutput).toContain('\'success\'');
    expect(debugOutput).toContain('\'warn\'');
    expect(debugOutput).toContain('\'error\'');

    // Verify platform services (7 total)
    expect(debugOutput).toContain('platform keys:');
    expect(debugOutput).toContain('\'logger\'');
    expect(debugOutput).toContain('\'llm\'');
    expect(debugOutput).toContain('\'analytics\'');

    // Verify runtime APIs (order may vary)
    expect(debugOutput).toContain('runtime keys:');
    expect(debugOutput).toContain('\'fs\'');
    expect(debugOutput).toContain('\'fetch\'');
    expect(debugOutput).toContain('\'env\'');

    // Verify FS methods (17 total)
    expect(debugOutput).toContain('runtime.fs methods:');
    expect(debugOutput).toContain('\'readFile\'');
    expect(debugOutput).toContain('\'writeFile\'');
    expect(debugOutput).toContain('\'exists\'');
    expect(debugOutput).toContain('\'mkdir\'');

    // Verify plugin API modules
    expect(debugOutput).toContain('api keys:');
    expect(debugOutput).toContain('\'lifecycle\'');
    expect(debugOutput).toContain('\'output\'');
    expect(debugOutput).toContain('\'state\'');

    // Verify lifecycle methods
    expect(debugOutput).toContain('api.lifecycle methods: [ \'onCleanup\' ]');

    // Verify output methods
    expect(debugOutput).toContain('api.output methods:');
    expect(debugOutput).toContain('\'result\'');
    expect(debugOutput).toContain('\'meta\'');

    // Verify input structure
    expect(debugOutput).toContain('"argv": []');
    expect(debugOutput).toContain('"name": "E2E-Test"');
  }, 60000); // 60s timeout for E2E test

  it('should execute handler and return correct exit code', async () => {
    const { stdout } = await execAsync(
      'KB_PLUGIN_VERSION=3 pnpm kb plugin-template:hello-v3 --name="ExitCode"',
      {
        cwd: '/Users/kirillbaranov/Desktop/kb-labs',
        env: {
          ...process.env,
          KB_PLUGIN_VERSION: '3',
        },
      }
    );

    // Check successful execution
    expect(stdout).toContain('[V3] Hello, ExitCode!');
    expect(stdout).toContain('[v3-adapter] V3 execution completed with exitCode: 0');
  }, 30000);

  it('should provide working fs.exists in subprocess', async () => {
    const { stdout } = await execAsync(
      'KB_PLUGIN_VERSION=3 pnpm kb plugin-template:hello-v3',
      {
        cwd: '/Users/kirillbaranov/Desktop/kb-labs',
        env: {
          ...process.env,
          KB_PLUGIN_VERSION: '3',
        },
      }
    );

    // Verify FS access worked
    expect(stdout).toContain('[V3] CWD exists: true');
  }, 30000);

  it('should provide working trace API', async () => {
    const { stdout } = await execAsync(
      'KB_PLUGIN_VERSION=3 pnpm kb plugin-template:hello-v3 --name="Trace"',
      {
        cwd: '/Users/kirillbaranov/Desktop/kb-labs',
        env: {
          ...process.env,
          KB_PLUGIN_VERSION: '3',
        },
      }
    );

    // Verify trace events were logged
    expect(stdout).toContain('[DEBUG] [trace] hello-v3.start');
    expect(stdout).toContain('name: \'Trace\'');
    expect(stdout).toContain('[DEBUG] [trace] hello-v3.end');
  }, 30000);
});
