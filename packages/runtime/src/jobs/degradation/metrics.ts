/**
 * @module @kb-labs/plugin-runtime/jobs/degradation/metrics
 * System metrics collection
 */

import * as os from 'node:os';
import type { RedisClientFactoryResult } from '@kb-labs/workflow-engine';
import type { SystemMetrics } from './types.js';

/**
 * Collect system metrics
 */
export class SystemMetricsCollector {
  constructor(private readonly redis: RedisClientFactoryResult) {}

  /**
   * Collect current system metrics
   */
  async collect(): Promise<SystemMetrics> {
    const [cpuUsage, memoryUsage, queueDepth, activeJobs] = await Promise.all([
      this.getCpuUsage(),
      this.getMemoryUsage(),
      this.getQueueDepth(),
      this.getActiveJobs(),
    ]);

    return {
      cpuUsage,
      memoryUsage,
      queueDepth,
      activeJobs,
      timestamp: Date.now(),
    };
  }

  /**
   * Get CPU usage percentage
   */
  private async getCpuUsage(): Promise<number> {
    const cpus = os.cpus();
    if (cpus.length === 0) {
      return 0;
    }

    // Calculate average CPU usage across all cores
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (100 * idle) / total;

    return Math.min(100, Math.max(0, usage));
  }

  /**
   * Get memory usage percentage
   */
  private async getMemoryUsage(): Promise<number> {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const usage = (usedMem / totalMem) * 100;

    return Math.min(100, Math.max(0, usage));
  }

  /**
   * Get queue depth from Redis
   */
  private async getQueueDepth(): Promise<number> {
    try {
      // Get queue sizes from all priority queues
      const priorities = ['high', 'normal', 'low'];
      const depths = await Promise.all(
        priorities.map((priority) =>
          this.redis.client.zcard(this.redis.keys.jobQueue(priority as any))
        )
      );

      return depths.reduce((sum, depth) => sum + depth, 0);
    } catch (error) {
      // If Redis fails, return 0
      return 0;
    }
  }

  /**
   * Get active jobs count from Redis
   */
  private async getActiveJobs(): Promise<number> {
    try {
      // Get count of runs with status 'running'
      // This is a simplified version - actual implementation depends on StateStore
      const pattern = 'kb:run:*';
      const keys = await this.redis.client.keys(pattern);

      let activeCount = 0;
      for (const key of keys) {
        const data = await this.redis.client.get(key as string);
        if (data) {
          try {
            const run = JSON.parse(data);
            if (run.status === 'running') {
              activeCount++;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      return activeCount;
    } catch (error) {
      return 0;
    }
  }
}
