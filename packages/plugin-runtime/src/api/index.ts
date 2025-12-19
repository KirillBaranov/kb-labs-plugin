/**
 * Plugin API implementations
 */

import type {
  PluginAPI,
  CleanupFn,
  CacheAdapter,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';

import { createLifecycleAPI, executeCleanup } from './lifecycle.js';
import { createStateAPI } from './state.js';
import { createArtifactsAPI } from './artifacts.js';
import { createShellAPI } from './shell.js';
import { createEventsAPI, createNoopEventsAPI, type EventEmitterFn } from './events.js';
import { createInvokeAPI, createNoopInvokeAPI, type PluginInvokerFn } from './invoke.js';

// Re-export individual APIs
export { createLifecycleAPI, executeCleanup } from './lifecycle.js';
export { createStateAPI } from './state.js';
export { createArtifactsAPI } from './artifacts.js';
export { createShellAPI } from './shell.js';
export { createEventsAPI, createNoopEventsAPI } from './events.js';
export { createInvokeAPI, createNoopInvokeAPI } from './invoke.js';
export type { EventEmitterFn } from './events.js';
export type { PluginInvokerFn } from './invoke.js';

export interface CreatePluginAPIOptions {
  pluginId: string;
  tenantId?: string;
  cwd: string;
  outdir: string;
  permissions: PermissionSpec;
  cache: CacheAdapter;
  eventEmitter?: EventEmitterFn;
  pluginInvoker?: PluginInvokerFn;
  cleanupStack: Array<CleanupFn>;
}

/**
 * Create the complete PluginAPI
 */
export function createPluginAPI(options: CreatePluginAPIOptions): PluginAPI {
  const {
    pluginId,
    tenantId,
    cwd,
    outdir,
    permissions,
    cache,
    eventEmitter,
    pluginInvoker,
    cleanupStack,
  } = options;

  return {
    lifecycle: createLifecycleAPI(cleanupStack),
    state: createStateAPI({ pluginId, tenantId, cache }),
    artifacts: createArtifactsAPI({ outdir }),
    shell: createShellAPI({ permissions, cwd }),
    events: eventEmitter
      ? createEventsAPI({ pluginId, emitter: eventEmitter })
      : createNoopEventsAPI(),
    invoke: pluginInvoker
      ? createInvokeAPI({ permissions, invoker: pluginInvoker })
      : createNoopInvokeAPI(),
  };
}
