/**
 * Plugin API implementations
 */

import type {
  PluginAPI,
  CleanupFn,
  CacheAdapter,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';
import type { IWorkflowEngine } from '@kb-labs/core-platform';

import { createLifecycleAPI, executeCleanup } from './lifecycle.js';
import { createStateAPI } from './state.js';
import { createArtifactsAPI } from './artifacts.js';
import { createShellAPI } from './shell.js';
import { createEventsAPI, createNoopEventsAPI, type EventEmitterFn } from './events.js';
import { createInvokeAPI, createNoopInvokeAPI, type PluginInvokerFn } from './invoke.js';
import { createWorkflowsAPI, createNoopWorkflowsAPI } from './workflows.js';
import { createJobsAPI, createNoopJobsAPI } from './jobs.js';
import { createCronAPI, createNoopCronAPI } from './cron.js';

// Re-export individual APIs
export { createLifecycleAPI, executeCleanup } from './lifecycle.js';
export { createStateAPI } from './state.js';
export { createArtifactsAPI } from './artifacts.js';
export { createShellAPI } from './shell.js';
export { createEventsAPI, createNoopEventsAPI } from './events.js';
export { createInvokeAPI, createNoopInvokeAPI } from './invoke.js';
export { createWorkflowsAPI, createNoopWorkflowsAPI } from './workflows.js';
export { createJobsAPI, createNoopJobsAPI } from './jobs.js';
export { createCronAPI, createNoopCronAPI } from './cron.js';
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
  workflowEngine?: IWorkflowEngine;
  /**
   * Workflow Service base URL for Jobs/Cron HTTP APIs
   * @example "http://localhost:3000"
   */
  workflowServiceUrl?: string;
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
    workflowEngine,
    workflowServiceUrl,
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
    workflows: workflowEngine
      ? createWorkflowsAPI({ tenantId, engine: workflowEngine, permissions })
      : createNoopWorkflowsAPI(),
    jobs: workflowServiceUrl
      ? createJobsAPI({ tenantId, workflowServiceUrl, permissions })
      : createNoopJobsAPI(),
    cron: workflowServiceUrl
      ? createCronAPI({ tenantId, workflowServiceUrl, permissions })
      : createNoopCronAPI(),
  };
}
