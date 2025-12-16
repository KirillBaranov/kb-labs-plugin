/**
 * Bootstrap script for sandboxed plugin execution
 *
 * This is the entry point for the child process.
 * It receives the descriptor via IPC and creates the context.
 */

import type { ParentMessage, ChildMessage, ExecuteMessage } from './ipc-protocol.js';
import type { UIFacade, CommandResult } from '@kb-labs/plugin-contracts-v3';
import { PluginError, wrapError } from '@kb-labs/plugin-contracts-v3';
import { createPluginContextV3 } from '../context/index.js';
import { executeCleanup } from '../api/index.js';
import { connectToPlatform } from './platform-client.js';

// Create simple stdout UI
function createStdoutUI(): UIFacade {
  return {
    info: (msg) => console.log(msg),
    success: (msg) => console.log(`✓ ${msg}`),
    warn: (msg) => console.warn(`⚠ ${msg}`),
    error: (err) => console.error(err instanceof Error ? err.message : err),
    debug: (msg) => {
      if (process.env.DEBUG) console.debug(msg);
    },
    spinner: (msg) => {
      console.log(`⟳ ${msg}`);
      return {
        update: (m) => console.log(`⟳ ${m}`),
        succeed: (m) => console.log(`✓ ${m ?? msg}`),
        fail: (m) => console.log(`✗ ${m ?? msg}`),
        stop: () => {},
      };
    },
    table: (data) => console.table(data),
    json: (data) => console.log(JSON.stringify(data, null, 2)),
    newline: () => console.log(),
    divider: () => console.log('─'.repeat(40)),
    box: (content, title) => {
      if (title) console.log(`┌─ ${title} ─┐`);
      console.log(content);
      if (title) console.log(`└${'─'.repeat(title.length + 4)}┘`);
    },
    confirm: async () => true,
    prompt: async () => '',
  };
}


// Abort controller for cancellation
const abortController = new AbortController();

// Handle messages from parent
process.on('message', async (msg: ParentMessage) => {
  if (msg.type === 'abort') {
    abortController.abort();
    return;
  }

  if (msg.type !== 'execute') return;

  const executeMsg = msg as ExecuteMessage;
  const { descriptor, handlerPath, input, socketPath } = executeMsg;

  // Connect to platform services via RPC
  const platform = await connectToPlatform(socketPath);

  // Create stdout UI (plain text output)
  const ui = createStdoutUI();

  // Create context
  const { context, cleanupStack } = createPluginContextV3({
    descriptor,
    platform,
    ui,
    signal: abortController.signal,
  });

  try {
    // Import handler
    const handlerModule = await import(handlerPath);
    const handler = handlerModule.default ?? handlerModule;

    if (typeof handler.execute !== 'function') {
      throw new PluginError(
        `Handler at ${handlerPath} does not export an execute function`,
        'INVALID_HANDLER'
      );
    }

    // Execute handler
    const result: CommandResult | void = await handler.execute(context, input);

    // Send result to parent
    const resultMsg: ChildMessage = {
      type: 'result',
      data: result?.data,
    };
    process.send?.(resultMsg);
  } catch (error) {
    // Send error to parent
    const pluginError = wrapError(error);
    const errorMsg: ChildMessage = {
      type: 'error',
      error: pluginError.toJSON(),
    };
    process.send?.(errorMsg);
  } finally {
    // Execute cleanups
    await executeCleanup(cleanupStack, platform.logger);
  }
});

// Signal ready to parent
const readyMsg: ChildMessage = { type: 'ready' };
process.send?.(readyMsg);
