import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SmartConfigHelper } from '../config-helper.js';
import { OperationTracker } from '../../operations/operation-tracker.js';
import { createMockFs } from '../../mocks/fs-mock.js';

describe('SmartConfigHelper', () => {
  let workdir: string;
  let helper: SmartConfigHelper;
  let tracker: OperationTracker;

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), 'kb-config-helper-'));
    tracker = new OperationTracker();
    const { fs } = createMockFs(workdir, true);
    helper = new SmartConfigHelper({ workdir, fs, tracker });
  });

  afterEach(async () => {
    await rm(workdir, { recursive: true, force: true });
  });

  it('writes new config sections and records operations', async () => {
    const result = await helper.ensureSection('plugins.example', { enabled: true });

    expect(result.changed).toBe(true);
    expect(result.pointer).toBe('/plugins/example');

    const configPath = path.join(workdir, '.kb/kb-labs.config.json');
    const content = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.plugins.example.enabled).toBe(true);

    const operations = tracker.toArray();
    expect(operations).toHaveLength(1);
    const operation = operations[0];
    expect(operation.operation.kind).toBe('config');
    expect(operation.status).toBe('applied');
  });

  it('skips writes when configuration is unchanged', async () => {
    await helper.ensureSection('plugins.example', { enabled: true });
    tracker.clear();

    const result = await helper.ensureSection('plugins.example', { enabled: true });
    expect(result.changed).toBe(false);

    const operations = tracker.toArray();
    expect(operations).toHaveLength(1);
    expect(operations[0].status).toBe('skipped');
    expect(operations[0].reason).toBe('no-op');
  });

  it('supports shallow merge strategy', async () => {
    await helper.ensureSection('plugins.example', { enabled: true });

    await helper.ensureSection(
      'plugins.example',
      { timeoutMs: 5000 },
      { strategy: 'shallow' }
    );

    const content = await readFile(path.join(workdir, '.kb/kb-labs.config.json'), 'utf8');
    const parsed = JSON.parse(content);
    expect(parsed.plugins.example.enabled).toBe(true);
    expect(parsed.plugins.example.timeoutMs).toBe(5000);
  });

  it('replaces sections with replace strategy', async () => {
    await helper.ensureSection('plugins.example', { enabled: true });

    await helper.ensureSection(
      'plugins.example',
      { enabled: false },
      { strategy: 'replace' }
    );

    const parsed = JSON.parse(
      await readFile(path.join(workdir, '.kb/kb-labs.config.json'), 'utf8')
    );
    expect(parsed.plugins.example.enabled).toBe(false);
  });
});


