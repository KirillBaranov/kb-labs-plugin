import { describe, it, expect, vi } from 'vitest';
import { createEventBus, DEFAULT_EVENT_BUS_CONFIG } from '../index';
import type { EventBus } from '../types';

function createBus(overrides: Partial<typeof DEFAULT_EVENT_BUS_CONFIG> = {}): {
  bus: EventBus;
  analytics: ReturnType<typeof vi.fn>;
} {
  const analytics = vi.fn().mockResolvedValue(undefined);
  const bus = createEventBus({
    config: {
      ...DEFAULT_EVENT_BUS_CONFIG,
      ...overrides,
    },
    hooks: {
      analytics,
    },
    permissions: {
      events: {
        produce: ['kb.*'],
        consume: ['kb.*'],
        scopes: ['local', 'plugin'],
      },
    },
    contextMeta: {
      pluginId: 'kb.test',
      pluginVersion: '1.0.0',
      requestId: 'req-1',
    },
  });

  return { bus, analytics };
}

describe('ScopedEventBus', () => {
  it('delivers events to local listeners', async () => {
    const { bus } = createBus();
    const handler = vi.fn();
    bus.on('kb.event.test', async event => {
      handler(event.payload);
    });

    await bus.emit('kb.event.test', { value: 42 });
    await bus.shutdown();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('supports waitFor with predicate', async () => {
    const { bus } = createBus();

    const waitPromise = bus.waitFor(
      'kb.event.wait',
      event => (event.payload as any).status === 'done',
      { timeoutMs: 2000 }
    );

    await bus.emit('kb.event.wait', { status: 'pending' });
    await bus.emit('kb.event.wait', { status: 'done' });

    const event = await waitPromise;
    await bus.shutdown();

    expect(event.payload).toEqual({ status: 'done' });
  });

  it('rejects waitFor on timeout', async () => {
    const { bus } = createBus();
    await expect(
      bus.waitFor('kb.event.timeout', undefined, { timeoutMs: 50 })
    ).rejects.toMatchObject({ code: 'E_EVENT_TIMEOUT' });
    await bus.shutdown();
  });

  it('enforces permissions for produce', async () => {
    const { bus } = createBus();
    await expect(bus.emit('forbidden.topic', {})).rejects.toMatchObject({
      code: 'E_PLUGIN_EVENT_DENIED',
    });
    await bus.shutdown();
  });

  it('honours max payload bytes', async () => {
    const { bus } = createBus({ maxPayloadBytes: 16 });
    await expect(bus.emit('kb.event.big', 'x'.repeat(32))).rejects.toMatchObject({
      code: 'E_EVENT_PAYLOAD_TOO_LARGE',
    });
    await bus.shutdown();
  });

  it('tracks drops when queue is saturated', async () => {
    const { bus, analytics } = createBus({
      maxQueueSize: 1,
      concurrentHandlers: 1,
      dropPolicy: 'drop-new',
    });

    let resolveHandler: (() => void) | undefined;
    bus.on('kb.event.drop', () => {
      return new Promise<void>(resolve => {
        resolveHandler = resolve;
      });
    });

    await bus.emit('kb.event.drop', {});
    await bus.emit('kb.event.drop', { second: true });

    resolveHandler?.();
    await bus.shutdown();

    const dropEvent = analytics.mock.calls.find(
      ([eventName]) => eventName === 'plugin.events.dropped'
    );
    expect(dropEvent?.[1]).toMatchObject({
      topic: 'kb.event.drop',
      reason: 'queue_saturated',
    });
  });
});

