/**
 * @module @kb-labs/plugin-runtime/execute-plugin/types
 * Types for simplified plugin execution architecture
 */

import type { ManifestV2, PermissionSpec } from '@kb-labs/plugin-manifest';
import type { PluginContextV2 } from '../context/plugin-context-v2';
import type { PluginRegistry } from '../registry';
import type { HandlerRef } from '../types';

/**
 * Options for executing a plugin command
 */
export interface ExecutePluginOptions {
  /** Plugin context (already created with platform, ui, runtime) */
  context: PluginContextV2;

  /** Handler reference (file path + export name) */
  handlerRef: HandlerRef;

  /** Command-line arguments */
  argv: string[];

  /** Parsed flags */
  flags: Record<string, unknown>;

  /** Plugin manifest */
  manifest: ManifestV2;

  /** Granted permissions */
  permissions: PermissionSpec;

  /** Plugin registry (for cross-plugin invocation) */
  registry?: PluginRegistry;

  /** Plugin root directory (for module resolution) */
  pluginRoot: string;

  /** Granted capabilities */
  grantedCapabilities?: string[];
}

/**
 * Result of plugin execution
 */
export interface ExecutePluginResult {
  /** Success flag */
  ok: boolean;

  /** Result data (if successful) */
  data?: unknown;

  /** Error (if failed) */
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack?: string;
  };

  /** Execution metrics */
  metrics: {
    timeMs: number;
  };

  /** Logs (if debug enabled) */
  logs?: string[];

  /** Profile data (if profiling enabled) */
  profile?: unknown;
}
