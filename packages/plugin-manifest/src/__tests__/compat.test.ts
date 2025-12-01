/**
 * @module @kb-labs/plugin-manifest/__tests__/compat
 * Tests for compatibility detection
 */

import { describe, it, expect } from 'vitest';
import {
  detectManifestVersion,
  checkDualManifest,
} from '../compat';
import type { ManifestV1, ManifestV2 } from '../types';

describe('detectManifestVersion', () => {
  it('should detect v2 manifest', () => {
    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: 'test',
      version: '1.0.0',
    };

    expect(detectManifestVersion(manifest)).toBe('v2');
  });

  it('should detect v1 manifest by schema', () => {
    const manifest: ManifestV1 = {
      manifestVersion: '1.0',
      commands: [],
    };

    expect(detectManifestVersion(manifest)).toBe('v1');
  });

  it('should detect v1 manifest by commands pattern', () => {
    const manifest = {
      commands: [
        {
          manifestVersion: '1.0',
          id: 'test:cmd',
          group: 'test',
          describe: 'Test',
          loader: async () => ({ run: async () => {} }),
        },
      ],
    };

    expect(detectManifestVersion(manifest)).toBe('v1');
  });

  it('should return unknown for invalid manifest', () => {
    expect(detectManifestVersion(null)).toBe('unknown');
    expect(detectManifestVersion({})).toBe('unknown');
    expect(detectManifestVersion('invalid')).toBe('unknown');
  });
});

describe('checkDualManifest', () => {
  it('should detect both v1 and v2 manifests', () => {
    const v1: ManifestV1 = {
      manifestVersion: '1.0',
      commands: [
        {
          manifestVersion: '1.0',
          id: 'test:cmd',
          group: 'test',
          describe: 'Test',
          loader: async () => ({ run: async () => {} }),
        },
      ],
    };

    const v2: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: 'test',
      version: '1.0.0',
    };

    const result = checkDualManifest(v1, v2, 'test-package');
    expect(result.hasV1).toBe(true);
    expect(result.hasV2).toBe(true);
    expect(result.warning).toContain('both v1 and v2');
    expect(result.warning).toContain('test-package');
  });

  it('should not warn when only v1 exists', () => {
    const v1: ManifestV1 = {
      manifestVersion: '1.0',
      commands: [
        {
          manifestVersion: '1.0',
          id: 'test:cmd',
          group: 'test',
          describe: 'Test',
          loader: async () => ({ run: async () => {} }),
        },
      ],
    };

    const result = checkDualManifest(v1, null, 'test-package');
    expect(result.hasV1).toBe(true);
    expect(result.hasV2).toBe(false);
    expect(result.warning).toBeUndefined();
  });

  it('should not warn when only v2 exists', () => {
    const v2: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: 'test',
      version: '1.0.0',
    };

    const result = checkDualManifest(null, v2, 'test-package');
    expect(result.hasV1).toBe(false);
    expect(result.hasV2).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('should extract plugin ID from v2', () => {
    const v2: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: 'my-plugin',
      version: '1.0.0',
    };

    const result = checkDualManifest(null, v2, 'package-name');
    expect(result.pluginId).toBe('my-plugin');
  });

  it('should extract plugin ID from v1 group', () => {
    const v1: ManifestV1 = {
      manifestVersion: '1.0',
      commands: [
        {
          manifestVersion: '1.0',
          id: 'my-plugin:cmd',
          group: 'my-plugin',
          describe: 'Test',
          loader: async () => ({ run: async () => {} }),
        },
      ],
    };

    const result = checkDualManifest(v1, null, 'package-name');
    expect(result.pluginId).toBe('my-plugin');
  });
});
