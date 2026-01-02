/**
 * @module @kb-labs/plugin-execution/__tests__/workspace
 *
 * Tests for workspace leasing (LocalWorkspaceManager).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { localWorkspaceManager } from '../workspace/local.js';
import type { WorkspaceRef, LeaseContext } from '../workspace/types.js';

describe('LocalWorkspaceManager', () => {
  const testWorkspace: WorkspaceRef = {
    type: 'local',
    cwd: '/test/workspace',
  };

  const testContext: LeaseContext = {
    executionId: 'exec-123',
    pluginRoot: '/plugins/test-plugin',
  };

  describe('lease', () => {
    it('should acquire lease for local workspace', async () => {
      const lease = await localWorkspaceManager.lease(testWorkspace, testContext);

      expect(lease).toBeDefined();
      expect(lease.workspaceId).toBeDefined();
      expect(typeof lease.workspaceId).toBe('string');
      expect(lease.pluginRoot).toBe(testContext.pluginRoot);
    });

    it('should return unique workspace IDs', async () => {
      const lease1 = await localWorkspaceManager.lease(testWorkspace, testContext);
      const lease2 = await localWorkspaceManager.lease(testWorkspace, {
        executionId: 'exec-456',
        pluginRoot: '/plugins/another',
      });

      expect(lease1.workspaceId).not.toBe(lease2.workspaceId);

      // Cleanup
      await localWorkspaceManager.release(lease1);
      await localWorkspaceManager.release(lease2);
    });

    it('should handle different workspace refs', async () => {
      const workspace1: WorkspaceRef = { type: 'local', cwd: '/workspace/one' };
      const workspace2: WorkspaceRef = { type: 'local', cwd: '/workspace/two' };

      const lease1 = await localWorkspaceManager.lease(workspace1, testContext);
      const lease2 = await localWorkspaceManager.lease(workspace2, {
        executionId: 'exec-789',
        pluginRoot: '/plugins/test',
      });

      expect(lease1.workspaceId).toBeDefined();
      expect(lease2.workspaceId).toBeDefined();

      // Cleanup
      await localWorkspaceManager.release(lease1);
      await localWorkspaceManager.release(lease2);
    });

    it('should preserve pluginRoot from context', async () => {
      const customContext: LeaseContext = {
        executionId: 'exec-custom',
        pluginRoot: '/custom/plugin/path',
      };

      const lease = await localWorkspaceManager.lease(testWorkspace, customContext);

      expect(lease.pluginRoot).toBe('/custom/plugin/path');

      await localWorkspaceManager.release(lease);
    });
  });

  describe('release', () => {
    it('should release lease without error', async () => {
      const lease = await localWorkspaceManager.lease(testWorkspace, testContext);

      // Should not throw
      await expect(localWorkspaceManager.release(lease)).resolves.not.toThrow();
    });

    it('should handle releasing same lease multiple times', async () => {
      const lease = await localWorkspaceManager.lease(testWorkspace, testContext);

      await localWorkspaceManager.release(lease);
      // Second release should also not throw (idempotent)
      await expect(localWorkspaceManager.release(lease)).resolves.not.toThrow();
    });

    it('should handle releasing non-existent lease', async () => {
      const fakeLease = {
        workspaceId: 'fake-id',
        pluginRoot: '/fake/path',
      };

      // Should not throw even for non-existent lease
      await expect(localWorkspaceManager.release(fakeLease)).resolves.not.toThrow();
    });
  });

  describe('concurrent leases', () => {
    it('should handle multiple concurrent leases', async () => {
      const leases = await Promise.all([
        localWorkspaceManager.lease(testWorkspace, { executionId: 'e1', pluginRoot: '/p1' }),
        localWorkspaceManager.lease(testWorkspace, { executionId: 'e2', pluginRoot: '/p2' }),
        localWorkspaceManager.lease(testWorkspace, { executionId: 'e3', pluginRoot: '/p3' }),
        localWorkspaceManager.lease(testWorkspace, { executionId: 'e4', pluginRoot: '/p4' }),
        localWorkspaceManager.lease(testWorkspace, { executionId: 'e5', pluginRoot: '/p5' }),
      ]);

      expect(leases).toHaveLength(5);

      // All should have unique IDs
      const ids = leases.map(l => l.workspaceId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);

      // Cleanup all
      await Promise.all(leases.map(l => localWorkspaceManager.release(l)));
    });
  });

  describe('lease lifecycle', () => {
    it('should allow re-leasing after release', async () => {
      // First lease
      const lease1 = await localWorkspaceManager.lease(testWorkspace, testContext);
      await localWorkspaceManager.release(lease1);

      // Second lease with DIFFERENT executionId (same context gives same ID)
      const lease2 = await localWorkspaceManager.lease(testWorkspace, {
        executionId: 'exec-456', // Different executionId
        pluginRoot: testContext.pluginRoot,
      });

      expect(lease2).toBeDefined();
      expect(lease2.workspaceId).not.toBe(lease1.workspaceId);

      await localWorkspaceManager.release(lease2);
    });

    it('should generate same workspaceId for same executionId', async () => {
      // With same executionId, workspaceId should be deterministic
      const lease1 = await localWorkspaceManager.lease(testWorkspace, testContext);
      await localWorkspaceManager.release(lease1);

      const lease2 = await localWorkspaceManager.lease(testWorkspace, testContext);

      expect(lease2.workspaceId).toBe(lease1.workspaceId);

      await localWorkspaceManager.release(lease2);
    });
  });
});
