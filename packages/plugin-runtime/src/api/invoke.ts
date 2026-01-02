/**
 * Invoke API implementation
 */

import type { InvokeAPI, InvokeOptions, PermissionSpec } from '@kb-labs/plugin-contracts';
import { PermissionError } from '@kb-labs/plugin-contracts';

/**
 * Plugin invoker function type
 */
export type PluginInvokerFn = <T = unknown>(
  pluginId: string,
  input?: unknown,
  options?: InvokeOptions
) => Promise<T>;

export interface CreateInvokeAPIOptions {
  permissions: PermissionSpec;
  invoker: PluginInvokerFn;
}

/**
 * Create InvokeAPI for calling other plugins
 */
export function createInvokeAPI(options: CreateInvokeAPIOptions): InvokeAPI {
  const { permissions, invoker } = options;

  // Check if invoke is allowed (empty array = disabled)
  const allowedPlugins = permissions.invoke?.allow ?? [];
  if (allowedPlugins.length === 0) {
    return {
      async call(): Promise<never> {
        throw new PermissionError('Plugin invocation not allowed');
      },
    };
  }

  return {
    async call<T = unknown>(
      pluginId: string,
      input?: unknown,
      invokeOptions?: InvokeOptions
    ): Promise<T> {
      // Check plugin whitelist
      if (!allowedPlugins.includes(pluginId) && !allowedPlugins.includes('*')) {
        throw new PermissionError(`Plugin not in whitelist`, {
          pluginId,
          allowedPlugins,
        });
      }

      return invoker<T>(pluginId, input, invokeOptions);
    },
  };
}

/**
 * Create a no-op invoke API (for when invoke is disabled)
 */
export function createNoopInvokeAPI(): InvokeAPI {
  return {
    async call(): Promise<never> {
      throw new PermissionError('Plugin invocation not allowed');
    },
  };
}
