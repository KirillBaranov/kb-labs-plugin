/**
 * @module @kb-labs/plugin-manifest/__tests__/migrate
 * Tests for V1→V2 migration
 */

import { describe, it, expect } from 'vitest';
import { migrateV1ToV2 } from '../migrate';
import type { ManifestV1 } from '../types';

describe('migrateV1ToV2', () => {
  it('should migrate a simple v1 manifest', () => {
    const v1: ManifestV1 = {
      manifestVersion: '1.0',
      commands: [
        {
          manifestVersion: '1.0',
          id: 'ai-review:review',
          group: 'ai-review',
          describe: 'Run code review against a unified diff',
          flags: [
            {
              name: 'diff',
              type: 'string',
              alias: 'd',
              description: 'Unified diff file (required)',
              required: true,
            },
            {
              name: 'profile',
              type: 'string',
              alias: 'p',
              description: 'Profile name',
            },
          ],
          examples: ['kb ai-review review --diff changes.diff'],
          loader: async () => {
            // Skip test - ai-review package not available in this workspace
            // const mod = await import('../../../../../../kb-labs-ai-review/packages/cli/src/commands/review');
            return { run: async () => {} };
          },
        },
      ],
    };

    const v2 = migrateV1ToV2(v1);

    expect(v2.schema).toBe('kb.plugin/2');
    expect(v2.id).toBe('ai-review');
    expect(v2.version).toBe('1.0.0'); // Default
    expect(v2.cli?.commands).toHaveLength(1);
    expect(v2.cli?.commands[0]?.id).toBe('ai-review:review');
    expect(v2.cli?.commands[0]?.group).toBe('ai-review');
    expect(v2.cli?.commands[0]?.flags).toHaveLength(2);
    expect(v2.cli?.commands[0]?.flags[0]?.name).toBe('diff');
    expect(v2.cli?.commands[0]?.flags[0]?.type).toBe('string');
    expect(v2.cli?.commands[0]?.examples).toEqual([
      'kb ai-review review --diff changes.diff',
    ]);
  });

  it('should preserve all flag properties during migration', () => {
    const v1: ManifestV1 = {
      manifestVersion: '1.0',
      commands: [
        {
          manifestVersion: '1.0',
          id: 'test:cmd',
          group: 'test',
          describe: 'Test command',
          flags: [
            {
              name: 'flag1',
              type: 'boolean',
              default: true,
              description: 'Boolean flag',
            },
            {
              name: 'flag2',
              type: 'number',
              choices: ['1', '2', '3'],
              required: true,
            },
            {
              name: 'flag3',
              type: 'array',
              alias: 'f',
            },
          ],
          loader: async () => ({ run: async () => {} }),
        },
      ],
    };

    const v2 = migrateV1ToV2(v1);
    const flags = v2.cli?.commands[0]?.flags || [];

    expect(flags[0]?.default).toBe(true);
    expect(flags[1]?.choices).toEqual(['1', '2', '3']);
    expect(flags[1]?.required).toBe(true);
    expect(flags[2]?.alias).toBe('f');
  });

  it('should extract plugin ID from group', () => {
    const v1: ManifestV1 = {
      manifestVersion: '1.0',
      commands: [
        {
          manifestVersion: '1.0',
          id: 'my-plugin:command',
          group: 'my-plugin',
          describe: 'Command',
          loader: async () => ({ run: async () => {} }),
        },
      ],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.id).toBe('my-plugin');
  });

  it('should extract plugin ID from command ID if group is missing', () => {
    const v1: ManifestV1 = {
      manifestVersion: '1.0',
      commands: [
        {
          manifestVersion: '1.0',
          id: 'fallback-plugin:command',
          group: '',
          describe: 'Command',
          loader: async () => ({ run: async () => {} }),
        },
      ],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.id).toBe('fallback-plugin');
  });
});
