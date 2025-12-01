/**
 * @module @kb-labs/plugin-manifest/runtime
 * Runtime contracts for plugin handlers
 */

/**
 * PluginContext provides runtime environment to plugin handlers
 */
export interface PluginContext {
  requestId: string;
  logger: { info(...a: any[]): void; error(...a: any[]): void };
  perms: { granted: string[] };
  analytics: { emit: (event: string, data: any) => Promise<void> };
  artifacts: { write: (declId: string, data: unknown) => Promise<void> };
  env: Record<string, string | undefined>;
}

/**
 * Handler function signature
 * All plugin handlers must match this signature
 */
export type Handler<I, O> = (input: I, ctx: PluginContext) => Promise<O>;
