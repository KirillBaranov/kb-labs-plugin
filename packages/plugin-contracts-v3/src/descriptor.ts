/**
 * Plugin Context Descriptor for V3 Plugin System
 *
 * This is a JSON-serializable structure passed via IPC from parent to child process.
 * It contains all the DATA needed to create a full PluginContextV3 in the sandbox.
 *
 * IMPORTANT: This does NOT contain functions - only data that can be JSON.stringify'd.
 */

import type { HostContext, HostType } from './host-context.js';
import type { PermissionSpec } from './permissions.js';

/**
 * JSON-serializable descriptor for creating plugin context
 */
export interface PluginContextDescriptor {
  /**
   * Entry point type (cli, rest, workflow, webhook)
   */
  readonly host: HostType;

  /**
   * Plugin identifier (from manifest)
   */
  readonly pluginId: string;

  /**
   * Plugin version (from manifest)
   */
  readonly pluginVersion: string;

  /**
   * Tenant ID for multi-tenancy (optional)
   */
  readonly tenantId?: string;

  /**
   * Parent request ID for tracing (when invoked from another plugin)
   */
  readonly parentRequestId?: string;

  /**
   * Invocation depth (prevents fork bomb via recursive plugin invocation)
   * Default: 0. Max: 3.
   */
  readonly invocationDepth?: number;

  /**
   * Current working directory
   */
  readonly cwd: string;

  /**
   * Output directory for artifacts (default: .kb/output)
   */
  readonly outdir?: string;

  /**
   * Plugin configuration (from kb.config.json or --config flag)
   */
  readonly config?: unknown;

  /**
   * Effective permissions (intersection of manifest + user config)
   */
  readonly permissions: PermissionSpec;

  /**
   * Host-specific context data
   */
  readonly hostContext: HostContext;
}
