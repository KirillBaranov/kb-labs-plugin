/**
 * @module @kb-labs/plugin-runtime/jobs/permissions
 * Permission checking for JobBroker
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { BackgroundJobRequest, ScheduledJobRequest } from './types.js';

/**
 * Permission check result
 */
export interface PermissionResult {
  /** Whether the action is allowed */
  allow: boolean;

  /** Reason if denied */
  reason?: string;

  /** Remediation suggestion */
  remediation?: string;
}

/**
 * Check submit permissions
 */
export function checkSubmitPermission(
  manifest: ManifestV2,
  request: BackgroundJobRequest,
  pluginId: string
): PermissionResult {
  const jobPerms = manifest.permissions?.jobs;

  // No job permissions defined
  if (!jobPerms || !jobPerms.submit) {
    return {
      allow: false,
      reason: 'No job.submit permissions defined in manifest',
      remediation: 'Add permissions.jobs.submit to your manifest.v2.ts',
    };
  }

  const submitPerms = jobPerms.submit;

  // Check if handler is allowed
  const allow = submitPerms.allow ?? 'own-plugin';

  if (allow === 'own-plugin') {
    // Handler must belong to the same plugin
    if (!request.handler.startsWith('handlers/')) {
      return {
        allow: false,
        reason: 'Handler must start with "handlers/"',
        remediation: 'Use handler path like "handlers/my-handler"',
      };
    }
    // Allow - handler is in own plugin
  } else if (Array.isArray(allow)) {
    // Check if handler matches any allowed pattern
    const allowed = allow.some((pattern) => {
      if (pattern === pluginId) {
        return request.handler.startsWith('handlers/');
      }
      // Support for future cross-plugin handlers
      return false;
    });

    if (!allowed) {
      return {
        allow: false,
        reason: 'Handler not in allowed list',
        remediation: `Add handler to permissions.jobs.submit.allow`,
      };
    }
  }

  // Check timeout limit
  if (request.timeout && submitPerms.maxDuration) {
    if (request.timeout > submitPerms.maxDuration) {
      return {
        allow: false,
        reason: `Timeout (${request.timeout}ms) exceeds maxDuration (${submitPerms.maxDuration}ms)`,
        remediation: `Reduce timeout to ${submitPerms.maxDuration}ms or less`,
      };
    }
  }

  return { allow: true };
}

/**
 * Check schedule permissions
 */
export function checkSchedulePermission(
  manifest: ManifestV2,
  request: ScheduledJobRequest,
  pluginId: string
): PermissionResult {
  const jobPerms = manifest.permissions?.jobs;

  // No job permissions defined
  if (!jobPerms || !jobPerms.schedule) {
    return {
      allow: false,
      reason: 'No job.schedule permissions defined in manifest',
      remediation: 'Add permissions.jobs.schedule to your manifest.v2.ts',
    };
  }

  const schedulePerms = jobPerms.schedule;

  // Check if handler is allowed (same logic as submit)
  const allow = schedulePerms.allow ?? 'own-plugin';

  if (allow === 'own-plugin') {
    if (!request.handler.startsWith('handlers/')) {
      return {
        allow: false,
        reason: 'Handler must start with "handlers/"',
        remediation: 'Use handler path like "handlers/my-handler"',
      };
    }
  } else if (Array.isArray(allow)) {
    const allowed = allow.some((pattern) => {
      if (pattern === pluginId) {
        return request.handler.startsWith('handlers/');
      }
      return false;
    });

    if (!allowed) {
      return {
        allow: false,
        reason: 'Handler not in allowed list',
        remediation: `Add handler to permissions.jobs.schedule.allow`,
      };
    }
  }

  // Check minInterval for interval-based schedules
  if (schedulePerms.minInterval && request.schedule) {
    const intervalMs = parseInterval(request.schedule);
    if (intervalMs !== null && intervalMs < schedulePerms.minInterval) {
      return {
        allow: false,
        reason: `Interval (${intervalMs}ms) is less than minInterval (${schedulePerms.minInterval}ms)`,
        remediation: `Increase interval to at least ${schedulePerms.minInterval}ms`,
      };
    }
  }

  return { allow: true };
}

/**
 * Parse interval string to milliseconds
 * Returns null if not an interval (might be cron)
 */
function parseInterval(schedule: string): number | null {
  const match = schedule.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    return null; // Not an interval, might be cron
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit]!;
}
