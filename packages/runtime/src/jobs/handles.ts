/**
 * @module @kb-labs/plugin-runtime/jobs/handles
 * JobHandle and ScheduleHandle implementations
 */

import type { WorkflowRun } from '@kb-labs/workflow-contracts';
import type { WorkflowEngine } from '@kb-labs/workflow-engine';
import type {
  JobHandle,
  JobStatus,
  JobResult,
  LogEntry,
  ScheduleHandle,
  ScheduleStatus,
  ScheduleInfo,
  JobInfo,
} from './types';

/**
 * JobHandle implementation
 */
export class JobHandleImpl<T = unknown> implements JobHandle<T> {
  readonly type = 'immediate' as const;

  constructor(
    private run: WorkflowRun,
    private engine: WorkflowEngine
  ) {}

  get jobId(): string {
    return this.run.id;
  }

  async cancel(): Promise<void> {
    await this.engine.cancelRun(this.run.id);
  }

  async status(): Promise<JobStatus> {
    const run = await this.engine.getRun(this.run.id);
    return this.mapStatus(run.status);
  }

  async wait(): Promise<JobResult<T>> {
    // Poll for completion
    const pollInterval = 1000; // 1 second
    const maxWait = 3600000; // 1 hour
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const run = await this.engine.getRun(this.run.id);

      if (run.status === 'success' || run.status === 'failed' || run.status === 'cancelled') {
        return this.buildResult(run);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout
    return {
      ok: false,
      error: {
        code: 'TIMEOUT',
        message: 'Job wait timeout exceeded',
      },
      metrics: {
        timeMs: Date.now() - startTime,
      },
    };
  }

  async *logs(): AsyncIterableIterator<LogEntry> {
    // TODO: Implement log streaming from workflow-engine
    // For now, return empty iterator
    // In future, integrate with LogStreamer from workflow-engine
    yield* [];
  }

  /**
   * Map workflow status to job status
   */
  private mapStatus(status: WorkflowRun['status']): JobStatus {
    switch (status) {
      case 'queued':
        return 'pending';
      case 'running':
        return 'running';
      case 'success':
        return 'success';
      case 'failed':
        return 'failed';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'pending';
    }
  }

  /**
   * Build result from WorkflowRun
   */
  private buildResult(run: WorkflowRun): JobResult<T> {
    if (run.status === 'success') {
      // Extract result from first job's first step
      const job = run.jobs[0];
      const step = job?.steps[0];
      const output = step?.result?.output;

      return {
        ok: true,
        data: output as T,
        metrics: {
          timeMs: run.finishedAt && run.createdAt
            ? new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime()
            : 0,
        },
      };
    } else {
      // Extract error from failed job
      const job = run.jobs[0];
      const step = job?.steps[0];
      const error = step?.result?.error;

      return {
        ok: false,
        error: error
          ? {
              code: error.code || 'UNKNOWN_ERROR',
              message: error.message || 'Job failed',
              details: error.details,
            }
          : {
              code: 'JOB_FAILED',
              message: `Job ${run.status}`,
            },
        metrics: {
          timeMs: run.finishedAt && run.createdAt
            ? new Date(run.finishedAt).getTime() - new Date(run.createdAt).getTime()
            : 0,
        },
      };
    }
  }
}

/**
 * ScheduleHandle implementation
 */
export class ScheduleHandleImpl implements ScheduleHandle {
  readonly type = 'scheduled' as const;

  constructor(
    public readonly scheduleId: string,
    private scheduler: any // TODO: Type this properly once CronScheduler is implemented
  ) {}

  async cancel(): Promise<void> {
    await this.scheduler.unregister(this.scheduleId);
  }

  async pause(): Promise<void> {
    await this.scheduler.pause(this.scheduleId);
  }

  async resume(): Promise<void> {
    await this.scheduler.resume(this.scheduleId);
  }

  async status(): Promise<ScheduleStatus> {
    const entry = await this.scheduler.getSchedule(this.scheduleId);
    return entry?.status || 'cancelled';
  }

  async info(): Promise<ScheduleInfo> {
    const entry = await this.scheduler.getSchedule(this.scheduleId);

    if (!entry) {
      throw new Error(`Schedule ${this.scheduleId} not found`);
    }

    return {
      scheduleId: entry.scheduleId,
      pluginId: entry.pluginId,
      handler: entry.handler,
      schedule: this.formatSchedule(entry.schedule),
      status: entry.status,
      createdAt: entry.createdAt,
      lastRun: entry.lastRun || undefined,
      nextRun: entry.schedule.nextRun,
      runCount: entry.runCount,
      maxRuns: entry.maxRuns,
      startAt: entry.startAt,
      endAt: entry.endAt,
    };
  }

  async listRuns(): Promise<JobInfo[]> {
    // TODO: Implement run history tracking
    // For now, return empty array
    return [];
  }

  async nextRun(): Promise<Date | null> {
    const entry = await this.scheduler.getSchedule(this.scheduleId);

    if (!entry || entry.status !== 'active') {
      return null;
    }

    return new Date(entry.schedule.nextRun);
  }

  /**
   * Format schedule for display
   */
  private formatSchedule(schedule: any): string {
    if (schedule.type === 'cron') {
      return schedule.expression;
    } else {
      // Convert ms back to interval string
      const ms = schedule.ms;
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
      if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
      if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
      return `${Math.floor(ms / 86400000)}d`;
    }
  }
}
