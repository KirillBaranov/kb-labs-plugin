import { describe, it, expect } from 'vitest';
import { buildRuntime } from '../runtime.js';
import { createEventBus, DEFAULT_EVENT_BUS_CONFIG } from '../../../events/index.js';
import type { ExecutionContext } from '../../../types.js';
import type { PermissionSpec, ManifestV2 } from '@kb-labs/plugin-manifest';

function createContext(busConfig = DEFAULT_EVENT_BUS_CONFIG): {
  ctx: ExecutionContext;
  manifest: ManifestV2;
  perms: PermissionSpec;
} {
  const manifest: ManifestV2 = {
    schema: 'kb.plugin/2',
    id: 'kb.test',
    version: '1.0.0',
  };

  const perms: PermissionSpec = {
    events: {
      produce: ['kb.*'],
      consume: ['kb.*'],
      scopes: ['local'],
    },
  };

  const ctx: ExecutionContext = {
    requestId: 'req-1',
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    routeOrCommand: 'cli:test',
    workdir: process.cwd(),
    pluginRoot: process.cwd(),
    extensions: {},
    adapterContext: undefined,
  } as any;

  const events = createEventBus({
    config: busConfig,
    permissions: perms,
    contextMeta: {
      pluginId: manifest.id,
      pluginVersion: manifest.version,
      requestId: ctx.requestId,
    },
  });

  ctx.extensions = {
    events: {
      local: events,
      config: busConfig,
    },
  };

  return { ctx, manifest, perms };
}

describe('buildRuntime events (in-process)', () => {
  it('exposes event API to handlers', async () => {
    const { ctx, manifest, perms } = createContext();
    const runtime = buildRuntime(perms, ctx, process.env, manifest);
    const events = runtime.events;
    expect(events).toBeDefined();

    const results: unknown[] = [];

    const unsubscribe = events!.on('kb.runtime.event', async event => {
      results.push(event.payload);
    });

    await events!.emit('kb.runtime.event', { step: 1 });
    unsubscribe();
    await (ctx.extensions!.events as any).local.shutdown();

    expect(results).toEqual([{ step: 1 }]);
  });
});

