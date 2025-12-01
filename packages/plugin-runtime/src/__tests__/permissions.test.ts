/**
 * @module @kb-labs/plugin-runtime/__tests__/permissions
 * Tests for permission checks
 */

import { describe, it, expect } from 'vitest';
import {
  checkFsPermission,
  checkNetPermission,
  checkEnvPermission,
  checkAllPermissions,
} from '../permissions';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { tmpdir } from 'node:os';

describe('checkNetPermission', () => {
  it('should deny when net is none', () => {
    const result = checkNetPermission('none', 'api.example.com');

    expect(result.granted).toBe(false);
    expect(result.reason).toContain('not permitted');
  });

  it('should grant when host is in allowedHosts', () => {
    const permission = { allowHosts: ['api.example.com', 'api.other.com'] };
    const result = checkNetPermission(permission, 'api.example.com');

    expect(result.granted).toBe(true);
  });

  it('should deny when host is not in allowedHosts', () => {
    const permission = { allowHosts: ['api.example.com'] };
    const result = checkNetPermission(permission, 'api.other.com');

    expect(result.granted).toBe(false);
    expect(result.reason).toContain('not in allowHosts');
  });

  it('should support wildcard subdomain', () => {
    const permission = { allowHosts: ['*.example.com'] };
    const result = checkNetPermission(permission, 'sub.example.com');

    expect(result.granted).toBe(true);
  });

  it('should normalize hostname (remove protocol, port, path)', () => {
    const permission = { allowHosts: ['api.example.com'] };
    const result = checkNetPermission(permission, 'https://api.example.com:443/path');

    expect(result.granted).toBe(true);
  });

  it('should deny when host is in denyHosts', () => {
    const permission = {
      allowHosts: ['api.example.com'],
      denyHosts: ['api.example.com'],
    };
    const result = checkNetPermission(permission, 'api.example.com');

    expect(result.granted).toBe(false);
    expect(result.reason).toContain('denyHosts');
  });
});

describe('checkEnvPermission', () => {
  it('should deny when whitelist is empty', () => {
    const result = checkEnvPermission(undefined, 'MY_VAR');

    expect(result.granted).toBe(false);
    expect(result.reason).toContain('whitelist is empty');
  });

  it('should grant when env var is in whitelist', () => {
    const whitelist = ['MY_VAR', 'OTHER_VAR'];
    const result = checkEnvPermission(whitelist, 'MY_VAR');

    expect(result.granted).toBe(true);
  });

  it('should deny when env var is not in whitelist', () => {
    const whitelist = ['MY_VAR'];
    const result = checkEnvPermission(whitelist, 'OTHER_VAR');

    expect(result.granted).toBe(false);
    expect(result.reason).toContain('not in whitelist');
  });

  it('should support wildcard patterns', () => {
    const whitelist = ['KB_LABS_*'];
    const result = checkEnvPermission(whitelist, 'KB_LABS_API_KEY');

    expect(result.granted).toBe(true);
  });
});

describe('checkFsPermission', () => {
  it('should deny when permission is none', async () => {
    const result = await checkFsPermission({ mode: 'none' }, '/tmp/test');

    expect(result.granted).toBe(false);
    expect(result.reason).toContain('not permitted');
  });

  it('should grant when path is accessible and permission is read', async () => {
    const testFile = path.join(tmpdir(), `test-${Date.now()}.txt`);
    await fs.writeFile(testFile, 'test');

    try {
      const result = await checkFsPermission({ mode: 'read' }, testFile);
      expect(result.granted).toBe(true);
    } finally {
      await fs.unlink(testFile).catch(() => {});
    }
  });

  it('should deny when path matches deny pattern', async () => {
    const result = await checkFsPermission(
      {
        mode: 'read',
        allow: ['**/*'],
        deny: ['**/*.key'],
      },
      '/tmp/secret.key'
    );

    expect(result.granted).toBe(false);
    expect(result.reason).toContain('deny pattern');
  });

  it('should grant when path matches allow pattern', async () => {
    const result = await checkFsPermission(
      {
        mode: 'read',
        allow: ['out/**', 'tmp/**'],
      },
      'out/file.txt'
    );

    expect(result.granted).toBe(true);
  });
});

describe('checkAllPermissions', () => {
  it('should grant when all permissions are satisfied', async () => {
    const permissions = {
      fs: { mode: 'read' as const },
      net: { allowHosts: ['api.example.com'] },
      env: { allow: ['MY_VAR'] },
    };

    const testFile = path.join(tmpdir(), `test-${Date.now()}.txt`);
    await fs.writeFile(testFile, 'test');

    try {
      const result = await checkAllPermissions(permissions, {
        fsTarget: testFile,
        netTarget: 'api.example.com',
        envVar: 'MY_VAR',
      });

      expect(result.allGranted).toBe(true);
      expect(result.fs?.granted).toBe(true);
      expect(result.net?.granted).toBe(true);
      expect(result.env?.granted).toBe(true);
    } finally {
      await fs.unlink(testFile).catch(() => {});
    }
  });

  it('should deny when any permission is not satisfied', async () => {
    const permissions = {
      net: { allowHosts: ['api.example.com'] },
      env: { allow: ['MY_VAR'] },
    };

    const result = await checkAllPermissions(permissions, {
      netTarget: 'api.other.com', // Not in allowHosts
      envVar: 'MY_VAR',
    });

    expect(result.allGranted).toBe(false);
    expect(result.net?.granted).toBe(false);
  });
});
