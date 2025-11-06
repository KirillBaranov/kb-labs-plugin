/**
 * @module @kb-labs/plugin-adapter-cli/__tests__/flags
 * Tests for flag mapping
 */

import { describe, it, expect, vi } from 'vitest';
import { mapFlag, registerFlags } from '../flags.js';
import type { CliFlagDecl } from '@kb-labs/plugin-manifest';

describe('mapFlag', () => {
  it('should map string flag', () => {
    const flag: CliFlagDecl = {
      name: 'diff',
      type: 'string',
      alias: 'd',
      description: 'Diff file',
      required: true,
    };

    const builder = vi.fn();
    mapFlag(flag, builder);

    expect(builder).toHaveBeenCalledWith({
      diff: {
        type: 'string',
        alias: 'd',
        description: 'Diff file',
        demandOption: true,
      },
    });
  });

  it('should map boolean flag', () => {
    const flag: CliFlagDecl = {
      name: 'debug',
      type: 'boolean',
      description: 'Debug mode',
      default: false,
    };

    const builder = vi.fn();
    mapFlag(flag, builder);

    expect(builder).toHaveBeenCalledWith({
      debug: {
        type: 'boolean',
        description: 'Debug mode',
        default: false,
      },
    });
  });

  it('should map number flag', () => {
    const flag: CliFlagDecl = {
      name: 'max-comments',
      type: 'number',
      description: 'Max comments',
      choices: ['1', '2', '3'],
    };

    const builder = vi.fn();
    mapFlag(flag, builder);

    expect(builder).toHaveBeenCalledWith({
      'max-comments': {
        type: 'number',
        description: 'Max comments',
        choices: [1, 2, 3],
      },
    });
  });

  it('should map array flag', () => {
    const flag: CliFlagDecl = {
      name: 'tags',
      type: 'array',
      description: 'Tags',
      default: ['default'],
    };

    const builder = vi.fn();
    mapFlag(flag, builder);

    expect(builder).toHaveBeenCalledWith({
      tags: {
        type: 'array',
        description: 'Tags',
        default: ['default'],
      },
    });
  });
});

describe('registerFlags', () => {
  it('should register multiple flags', () => {
    const flags: CliFlagDecl[] = [
      {
        name: 'flag1',
        type: 'string',
        description: 'Flag 1',
      },
      {
        name: 'flag2',
        type: 'boolean',
        description: 'Flag 2',
      },
    ];

    const builder = vi.fn();
    registerFlags(flags, builder);

    expect(builder).toHaveBeenCalledTimes(2);
  });
});
