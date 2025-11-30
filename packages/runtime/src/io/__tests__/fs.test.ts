import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createFsShim } from '../fs';
import { OperationTracker } from '../../operations/operation-tracker';

describe('createFsShim', () => {
  let workdir: string;

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), 'kb-fs-shim-'));
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('allows writing to paths that match relative allow patterns', async () => {
    const fsShim = createFsShim(
      {
        mode: 'readWrite',
        allow: ['.kb/test/**'],
      },
      workdir,
    );

    await fsShim.writeFile('.kb/test/example.txt', 'hello');
    const content = await readFile(
      path.join(workdir, '.kb/test/example.txt'),
      'utf8',
    );
    expect(content).toBe('hello');
  });

  it('denies writes outside declared allow patterns', async () => {
    const fsShim = createFsShim(
      {
        mode: 'readWrite',
        allow: ['.kb/test/**'],
      },
      workdir,
    );

    await expect(
      fsShim.writeFile('outside/example.txt', 'nope'),
    ).rejects.toThrow(/does not match any allow pattern/);
  });

  it('simulates writes in dry-run mode', async () => {
    const tracker = new OperationTracker();
    const fsShim = createFsShim(
      {
        mode: 'readWrite',
        allow: ['.kb/test/**'],
      },
      workdir,
      undefined,
      { dryRun: true, operationTracker: tracker } as any,
    );

    await fsShim.writeFile('.kb/test/dry-run.txt', 'noop');
    await expect(
      access(path.join(workdir, '.kb/test/dry-run.txt')),
    ).rejects.toThrow();

    const operations = tracker.toArray();
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('skipped');
    expect(operations[0].reason).toBe('dry-run');
  });

  it('records write operations via OperationTracker', async () => {
    const tracker = new OperationTracker();
    const fsShim = createFsShim(
      {
        mode: 'readWrite',
        allow: ['.kb/test/**'],
      },
      workdir,
      undefined,
      { operationTracker: tracker } as any,
    );

    await fsShim.writeFile('.kb/test/tracked.txt', 'hi');

    const operations = tracker.toArray();
    expect(operations).toHaveLength(1);
    expect(operations[0].operation.path).toBe('.kb/test/tracked.txt');
    expect(operations[0].status).toBe('applied');
  });
});

