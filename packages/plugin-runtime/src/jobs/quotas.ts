/**
 * @module @kb-labs/plugin-runtime/jobs/quotas
 * Quota enforcement for JobBroker
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';

// Redis client will be injected from workflow-engine
type RedisFactoryResult = any;

/**
 * Quota check result
 */
export interface QuotaResult {
  /** Whether the action is allowed */
  allow: boolean;

  /** Reason if denied */
  reason?: string;

  /** Current usage */
  current?: number;

  /** Limit */
  limit?: number;

  /** Remediation suggestion */
  remediation?: string;
}

/**
 * Quota tracker
 */
export class QuotaTracker {
  constructor(
    private redis: RedisFactoryResult,
    private pluginId: string,
    private manifest: ManifestV2
  ) {}

  /**
   * Check submit quotas
   */
  async checkSubmitQuota(): Promise<QuotaResult> {
    const submitPerms = this.manifest.permissions?.jobs?.submit;
    if (!submitPerms) {
      return { allow: true };
    }

    const quotas = submitPerms.quotas;
    if (!quotas) {
      return { allow: true };
    }

    const now = Date.now();

    // Check per-minute quota
    if (quotas.perMinute) {
      const key = this.getQuotaKey('submit', 'minute');
      const count = await this.getCount(key, 60 * 1000, now);

      if (count >= quotas.perMinute) {
        return {
          allow: false,
          reason: 'Per-minute quota exceeded',
          current: count,
          limit: quotas.perMinute,
          remediation: 'Wait for the next minute or increase quota limit',
        };
      }
    }

    // Check per-hour quota
    if (quotas.perHour) {
      const key = this.getQuotaKey('submit', 'hour');
      const count = await this.getCount(key, 60 * 60 * 1000, now);

      if (count >= quotas.perHour) {
        return {
          allow: false,
          reason: 'Per-hour quota exceeded',
          current: count,
          limit: quotas.perHour,
          remediation: 'Wait for the next hour or increase quota limit',
        };
      }
    }

    // Check per-day quota
    if (quotas.perDay) {
      const key = this.getQuotaKey('submit', 'day');
      const count = await this.getCount(key, 24 * 60 * 60 * 1000, now);

      if (count >= quotas.perDay) {
        return {
          allow: false,
          reason: 'Per-day quota exceeded',
          current: count,
          limit: quotas.perDay,
          remediation: 'Wait for the next day or increase quota limit',
        };
      }
    }

    return { allow: true };
  }

  /**
   * Check schedule quotas
   */
  async checkScheduleQuota(): Promise<QuotaResult> {
    const schedulePerms = this.manifest.permissions?.jobs?.schedule;
    if (!schedulePerms) {
      return { allow: true };
    }

    const quotas = schedulePerms.quotas;
    if (!quotas) {
      return { allow: true };
    }

    const now = Date.now();

    // Check per-hour quota
    if (quotas.perHour) {
      const key = this.getQuotaKey('schedule', 'hour');
      const count = await this.getCount(key, 60 * 60 * 1000, now);

      if (count >= quotas.perHour) {
        return {
          allow: false,
          reason: 'Per-hour schedule quota exceeded',
          current: count,
          limit: quotas.perHour,
          remediation: 'Wait for the next hour or increase quota limit',
        };
      }
    }

    // Check per-day quota
    if (quotas.perDay) {
      const key = this.getQuotaKey('schedule', 'day');
      const count = await this.getCount(key, 24 * 60 * 60 * 1000, now);

      if (count >= quotas.perDay) {
        return {
          allow: false,
          reason: 'Per-day schedule quota exceeded',
          current: count,
          limit: quotas.perDay,
          remediation: 'Wait for the next day or increase quota limit',
        };
      }
    }

    return { allow: true };
  }

  /**
   * Check maxConcurrent quota
   */
  async checkConcurrentQuota(): Promise<QuotaResult> {
    const submitPerms = this.manifest.permissions?.jobs?.submit;
    if (!submitPerms || !submitPerms.maxConcurrent) {
      return { allow: true };
    }

    const key = this.getConcurrentKey();
    const count = await this.redis.client.get(key);
    const current = count ? parseInt(count, 10) : 0;

    if (current >= submitPerms.maxConcurrent) {
      return {
        allow: false,
        reason: 'Maximum concurrent jobs exceeded',
        current,
        limit: submitPerms.maxConcurrent,
        remediation: 'Wait for some jobs to complete or increase maxConcurrent limit',
      };
    }

    return { allow: true };
  }

  /**
   * Check maxSchedules quota
   */
  async checkMaxSchedulesQuota(): Promise<QuotaResult> {
    const schedulePerms = this.manifest.permissions?.jobs?.schedule;
    if (!schedulePerms || !schedulePerms.maxSchedules) {
      return { allow: true };
    }

    const key = this.getActiveSchedulesKey();
    const count = await this.redis.client.get(key);
    const current = count ? parseInt(count, 10) : 0;

    if (current >= schedulePerms.maxSchedules) {
      return {
        allow: false,
        reason: 'Maximum active schedules exceeded',
        current,
        limit: schedulePerms.maxSchedules,
        remediation: 'Cancel some schedules or increase maxSchedules limit',
      };
    }

    return { allow: true };
  }

  /**
   * Increment quota counter
   */
  async incrementQuota(type: 'submit' | 'schedule'): Promise<void> {
    const now = Date.now();

    if (type === 'submit') {
      const quotas = this.manifest.permissions?.jobs?.submit?.quotas;
      if (!quotas) return;

      if (quotas.perMinute) {
        await this.increment(this.getQuotaKey('submit', 'minute'), 60 * 1000, now);
      }
      if (quotas.perHour) {
        await this.increment(this.getQuotaKey('submit', 'hour'), 60 * 60 * 1000, now);
      }
      if (quotas.perDay) {
        await this.increment(this.getQuotaKey('submit', 'day'), 24 * 60 * 60 * 1000, now);
      }
    } else {
      const quotas = this.manifest.permissions?.jobs?.schedule?.quotas;
      if (!quotas) return;

      if (quotas.perHour) {
        await this.increment(this.getQuotaKey('schedule', 'hour'), 60 * 60 * 1000, now);
      }
      if (quotas.perDay) {
        await this.increment(this.getQuotaKey('schedule', 'day'), 24 * 60 * 60 * 1000, now);
      }
    }
  }

  /**
   * Increment concurrent counter
   */
  async incrementConcurrent(): Promise<void> {
    const key = this.getConcurrentKey();
    await this.redis.client.incr(key);
  }

  /**
   * Decrement concurrent counter
   */
  async decrementConcurrent(): Promise<void> {
    const key = this.getConcurrentKey();
    const count = await this.redis.client.decr(key);

    // Clean up if zero
    if (count <= 0) {
      await this.redis.client.del(key);
    }
  }

  /**
   * Increment active schedules counter
   */
  async incrementActiveSchedules(): Promise<void> {
    const key = this.getActiveSchedulesKey();
    await this.redis.client.incr(key);
  }

  /**
   * Decrement active schedules counter
   */
  async decrementActiveSchedules(): Promise<void> {
    const key = this.getActiveSchedulesKey();
    const count = await this.redis.client.decr(key);

    // Clean up if zero
    if (count <= 0) {
      await this.redis.client.del(key);
    }
  }

  /**
   * Get count of events in time window
   */
  private async getCount(key: string, windowMs: number, now: number): Promise<number> {
    const min = now - windowMs;
    const count = await this.redis.client.zcount(key, min, now);
    return count;
  }

  /**
   * Increment counter in time window
   */
  private async increment(key: string, windowMs: number, now: number): Promise<void> {
    const min = now - windowMs;

    // Add current timestamp
    await this.redis.client.zadd(key, now, `${now}-${Math.random()}`);

    // Remove old entries
    await this.redis.client.zremrangebyscore(key, 0, min);

    // Set expiry
    await this.redis.client.expire(key, Math.ceil(windowMs / 1000));
  }

  /**
   * Get quota key
   */
  private getQuotaKey(type: 'submit' | 'schedule', period: 'minute' | 'hour' | 'day'): string {
    return `kb:jobs:quota:${this.pluginId}:${type}:${period}`;
  }

  /**
   * Get concurrent key
   */
  private getConcurrentKey(): string {
    return `kb:jobs:concurrent:${this.pluginId}`;
  }

  /**
   * Get active schedules key
   */
  private getActiveSchedulesKey(): string {
    return `kb:jobs:schedules:${this.pluginId}:count`;
  }
}
