/**
 * IPC Protocol for sandbox communication
 *
 * Defines message types between parent and child process.
 */

import type { PluginContextDescriptor, SerializedError } from '@kb-labs/plugin-contracts';

/**
 * Message from parent to child: Execute handler
 */
export interface ExecuteMessage {
  type: 'execute';
  descriptor: PluginContextDescriptor;
  socketPath: string;
  handlerPath: string;
  input: unknown;
}

/**
 * Message from parent to child: Abort execution
 */
export interface AbortMessage {
  type: 'abort';
}

/**
 * Union of messages from parent to child
 */
export type ParentMessage = ExecuteMessage | AbortMessage;

/**
 * Message from child to parent: Execution result
 */
export interface ResultMessage {
  type: 'result';
  exitCode: number;
  result?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Message from child to parent: Execution error
 */
export interface ErrorMessage {
  type: 'error';
  error: SerializedError;
}

/**
 * Message from child to parent: Ready to receive
 */
export interface ReadyMessage {
  type: 'ready';
}

/**
 * Union of messages from child to parent
 */
export type ChildMessage = ResultMessage | ErrorMessage | ReadyMessage;

/**
 * Type guard for ParentMessage
 */
export function isParentMessage(msg: unknown): msg is ParentMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as { type?: unknown };
  return m.type === 'execute' || m.type === 'abort';
}

/**
 * Type guard for ChildMessage
 */
export function isChildMessage(msg: unknown): msg is ChildMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as { type?: unknown };
  return m.type === 'result' || m.type === 'error' || m.type === 'ready';
}
