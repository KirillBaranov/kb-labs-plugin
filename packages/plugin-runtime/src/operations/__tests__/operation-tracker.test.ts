import { describe, expect, it } from 'vitest';

import type { OperationMetadata } from '@kb-labs/setup-engine-operations';
import { OperationTracker } from '../operation-tracker';

const FILE_OPERATION = {
  kind: 'file' as const,
  action: 'ensure' as const,
  path: '.kb/example.txt'
};

describe('OperationTracker', () => {
  it('tracks operations and preserves order', () => {
    const tracker = new OperationTracker();

    const firstMeta = tracker.createMetadata('file', 'Ensure example file');
    tracker.track(FILE_OPERATION, firstMeta);

    const secondMeta = tracker.createMetadata('config', 'Ensure config section');
    tracker.track(
      {
        kind: 'config',
        action: 'merge',
        path: '.kb/kb-labs.config.json',
        pointer: '/plugins/example'
      },
      secondMeta
    );

    const operations = tracker.toArray();
    expect(operations).toHaveLength(2);
    expect(operations[0].metadata.id).toBe(firstMeta.id);
    expect(operations[1].metadata.id).toBe(secondMeta.id);
  });

  it('updates status when marking applied/skipped/failed', () => {
    const tracker = new OperationTracker();
    const meta = tracker.createMetadata('file', 'Ensure example file');

    tracker.track(FILE_OPERATION, meta);
    tracker.markApplied(meta.id);
    tracker.markSkipped(meta.id, 'Already existed');

    const [operation] = tracker.toArray();
    expect(operation.status).toBe('skipped');
    expect(operation.reason).toBe('Already existed');

    tracker.markFailed(meta.id, 'Write failed');
    const [afterFailed] = tracker.toArray();
    expect(afterFailed.status).toBe('failed');
    expect(afterFailed.reason).toBe('Write failed');
  });

  it('ignores status updates for unknown identifiers', () => {
    const tracker = new OperationTracker();
    tracker.markApplied('missing');
    tracker.markSkipped('missing');

    expect(tracker.size).toBe(0);
  });

  it('copies metadata when returning operations', () => {
    const tracker = new OperationTracker();
    const meta: OperationMetadata = {
      id: 'custom-id',
      description: 'Custom operation',
      idempotent: true,
      reversible: true
    };

    tracker.track(FILE_OPERATION, meta);
    const [record] = tracker.toArray();

    expect(record.metadata).not.toBe(meta);
    expect(record.metadata.id).toBe('custom-id');
  });
});


