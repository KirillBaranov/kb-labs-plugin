/**
 * @module @kb-labs/plugin-adapter-cli/debug
 * Debug mode utilities
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { CliContext } from '@kb-labs/cli-core';

/**
 * Print debug information
 */
export function printDebugInfo(
  manifest: ManifestV2,
  grantedCapabilities: string[],
  context: CliContext
): void {
  const presenter = context.presenter;

  presenter.info(`Plugin: ${manifest.id}@${manifest.version}`);
  presenter.info(`Manifest schema: ${manifest.schema}`);

  // Capabilities
  if (manifest.capabilities) {
    presenter.info(`Required capabilities: ${manifest.capabilities.join(', ')}`);
    presenter.info(`Granted capabilities: ${grantedCapabilities.join(', ')}`);

    const missing = manifest.capabilities.filter(
      (cap: string) => !grantedCapabilities.includes(cap)
    );
    if (missing.length > 0) {
      presenter.warn(`Missing capabilities: ${missing.join(', ')}`);
    }
  }

  // Permissions
  if (manifest.permissions) {
    presenter.info('Permissions:');
    if (manifest.permissions.fs) {
      const fsMode = manifest.permissions.fs.mode || 'none';
      presenter.info(`  FS: ${fsMode}`);
      if (manifest.permissions.fs.allow?.length) {
        presenter.info(`    Allow: ${manifest.permissions.fs.allow.join(', ')}`);
      }
      if (manifest.permissions.fs.deny?.length) {
        presenter.info(`    Deny: ${manifest.permissions.fs.deny.join(', ')}`);
      }
    }
    if (manifest.permissions.net) {
      if (manifest.permissions.net === 'none') {
        presenter.info(`  Net: none`);
      } else {
        if (manifest.permissions.net.allowHosts?.length) {
          presenter.info(
            `  Net: ${manifest.permissions.net.allowHosts.join(', ')}`
          );
        }
      }
    }
    if (manifest.permissions.env?.allow) {
      presenter.info(`  Env: ${manifest.permissions.env.allow.join(', ')}`);
    }
    if (manifest.permissions.quotas) {
      if (manifest.permissions.quotas.timeoutMs) {
        presenter.info(`  Timeout: ${manifest.permissions.quotas.timeoutMs}ms`);
      }
      if (manifest.permissions.quotas.cpuMs) {
        presenter.info(`  CPU quota: ${manifest.permissions.quotas.cpuMs}ms`);
      }
      if (manifest.permissions.quotas.memoryMb) {
        presenter.info(`  Memory quota: ${manifest.permissions.quotas.memoryMb}MB`);
      }
    }
  }

  // Commands
  if (manifest.cli?.commands) {
    presenter.info(`Commands: ${manifest.cli.commands.length}`);
    for (const cmd of manifest.cli.commands) {
      presenter.info(`  - ${cmd.id}: ${cmd.describe}`);
    }
  }
}
