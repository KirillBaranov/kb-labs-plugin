/**
 * @module @kb-labs/plugin-runtime/jobs/broker
 * JobBroker - main API for background and scheduled jobs
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext } from '../types';
import type { WorkflowEngine } from '@kb-labs/workflow-engine';
import type { WorkflowSpec } from '@kb-labs/workflow-contracts';
import type {
  BackgroundJobRequest,
  ScheduledJobRequest,
  JobHandle,
  ScheduleHandle,
  JobStatus,
  JobInfo,
  JobFilter,
} from './types';
import { checkSubmitPermission, checkSchedulePermission } from './permissions';
import { QuotaTracker } from './quotas';
import { JobHandleImpl, ScheduleHandleImpl } from './handles';
import { CronScheduler } from './cron/scheduler';
import { DegradationController } from './degradation/controller';
import { toErrorEnvelope } from '../errors';
import { emitAnalyticsEvent } from '../analytics';
import { createRuntimeLogger } from '../logging';
import { ErrorCode } from '@kb-labs/api-contracts';

/**
 * JobBroker - facade over workflow-engine for background and scheduled jobs
 */
export class JobBroker {
  private quotaTracker: QuotaTracker;
  private logger: ReturnType<typeof createRuntimeLogger>;
  private degradationController?: DegradationController;

  constructor(
    private workflowEngine: WorkflowEngine,
    private callerManifest: ManifestV2,
    private ctx: ExecutionContext,
    private cronScheduler?: CronScheduler,
    degradationController?: DegradationController
  ) {
    this.degradationController = degradationController;
    // Initialize quota tracker
    // TODO: Pass redis from workflow-engine
    // For now, we'll create a mock tracker
    this.quotaTracker = new QuotaTracker(
      (workflowEngine as any).redis, // Access redis from engine
      ctx.pluginId,
      callerManifest
    );

    this.logger = createRuntimeLogger('jobs', ctx, {
      caller: ctx.pluginId,
    });

    // Setup listener for triggered cron jobs
    if (this.cronScheduler) {
      this.setupTriggeredJobListener();
    }
  }

  /**
   * Setup Redis subscriber for triggered cron jobs
   */
  private async setupTriggeredJobListener(): Promise<void> {
    try {
      const redis = (this.workflowEngine as any).redis;
      if (!redis) {
        this.logger.warn('Redis not available for cron job listener');
        return;
      }

      // Subscribe to triggered jobs channel
      const subscriber = redis.client;
      await subscriber.subscribe('kb:cron:triggered');

      subscriber.on('message', async (channel: string, message: string) => {
        if (channel !== 'kb:cron:triggered') {
          return;
        }

        try {
          const triggered = JSON.parse(message);

          // Only process jobs for this plugin
          if (triggered.pluginId !== this.ctx.pluginId) {
            return;
          }

          this.logger.debug('Triggered cron job', {
            scheduleId: triggered.scheduleId,
            handler: triggered.handler,
          });

          // Submit job via submit()
          await this.submit({
            handler: triggered.handler,
            input: triggered.input,
            priority: triggered.priority,
            timeout: triggered.timeout,
            retries: triggered.retries,
            tags: triggered.tags,
          });
        } catch (error) {
          this.logger.error('Failed to process triggered cron job', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    } catch (error) {
      this.logger.error('Failed to setup triggered job listener', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Submit a background job (one-time execution)
   */
  async submit<T = unknown>(request: BackgroundJobRequest): Promise<JobHandle<T>> {
    const startTime = Date.now();

    try {
      this.logger.debug('Submit job request', {
        handler: request.handler,
        priority: request.priority,
        delay: request.delay,
      });

      // 0. Check degradation state
      if (this.degradationController) {
        // Check if submissions should be rejected
        if (this.degradationController.shouldRejectSubmit()) {
          throw toErrorEnvelope(
            'JOB_SUBMIT_REJECTED_DEGRADED',
            503,
            {
              handler: request.handler,
              reason: 'System in critical state, job submissions temporarily disabled',
              state: this.degradationController.getState(),
              remediation: 'Wait for system to recover or increase capacity',
            },
            this.ctx,
            { timeMs: Date.now() - startTime }
          );
        }

        // Apply degradation delay if needed
        const delay = this.degradationController.getSubmitDelay();
        if (delay > 0) {
          this.logger.warn('Degradation delay applied', {
            delay,
            state: this.degradationController.getState(),
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // 1. Check permissions
      const permissionCheck = checkSubmitPermission(
        this.callerManifest,
        request,
        this.ctx.pluginId
      );

      if (!permissionCheck.allow) {
        await emitAnalyticsEvent('job.submit.denied', {
          caller: this.ctx.pluginId,
          handler: request.handler,
          reason: permissionCheck.reason,
          traceId: this.ctx.traceId,
          spanId: this.ctx.spanId,
        });

        throw toErrorEnvelope(
          ErrorCode.PLUGIN_PERMISSION_DENIED,
          403,
          {
            handler: request.handler,
            reason: permissionCheck.reason,
            remediation: permissionCheck.remediation,
          },
          this.ctx,
          { timeMs: Date.now() - startTime },
          this.callerManifest.permissions
        );
      }

      // 2. Check quotas
      const quotaChecks = await Promise.all([
        this.quotaTracker.checkSubmitQuota(),
        this.quotaTracker.checkConcurrentQuota(),
      ]);

      for (const quotaCheck of quotaChecks) {
        if (!quotaCheck.allow) {
          await emitAnalyticsEvent('job.submit.quota_exceeded', {
            caller: this.ctx.pluginId,
            handler: request.handler,
            reason: quotaCheck.reason,
            current: quotaCheck.current,
            limit: quotaCheck.limit,
          });

          throw toErrorEnvelope(
            ErrorCode.PLUGIN_QUOTA_EXCEEDED,
            429,
            {
              handler: request.handler,
              reason: quotaCheck.reason,
              current: quotaCheck.current,
              limit: quotaCheck.limit,
              remediation: quotaCheck.remediation,
            },
            this.ctx,
            { timeMs: Date.now() - startTime }
          );
        }
      }

      // 3. Create WorkflowSpec with single job/step
      const jobId = this.createJobId();
      const spec: WorkflowSpec = {
        name: `bg-job-${jobId}`,
        jobs: [
          {
            id: 'execute',
            steps: [
              {
                id: 'run',
                plugin: this.callerManifest.id,
                handler: request.handler,
                input: request.input,
                timeout: request.timeout,
              },
            ],
            priority: this.mapPriority(request.priority),
            retry: request.retries
              ? {
                  maxAttempts: request.retries,
                  backoff: 'exponential',
                  initialDelayMs: 1000,
                }
              : undefined,
          },
        ],
        tags: request.tags,
      };

      // 4. Submit to workflow-engine
      const run = await this.workflowEngine.createRun({
        spec,
        trigger: {
          type: 'plugin' as any,
          pluginId: this.ctx.pluginId,
        },
        metadata: {
          jobType: 'background',
          priority: request.priority ?? 5,
          delay: request.delay,
          handler: request.handler,
        } as any,
      });

      // 5. Increment quotas
      await this.quotaTracker.incrementQuota('submit');
      await this.quotaTracker.incrementConcurrent();

      // 6. Emit analytics
      await emitAnalyticsEvent('job.submit.success', {
        caller: this.ctx.pluginId,
        handler: request.handler,
        jobId: run.id,
        priority: request.priority,
        traceId: this.ctx.traceId,
        spanId: this.ctx.spanId,
      });

      this.logger.info('Job submitted', {
        jobId: run.id,
        handler: request.handler,
      });

      // 7. Return handle
      return new JobHandleImpl<T>(run, this.workflowEngine);
    } catch (error) {
      const timeMs = Date.now() - startTime;

      // If already an error envelope, rethrow
      if (error && typeof error === 'object' && 'code' in error && 'http' in error) {
        throw error;
      }

      // Log error
      this.logger.error('Job submit failed', {
        handler: request.handler,
        error: error instanceof Error ? error.message : String(error),
      });

      // Wrap in error envelope
      throw toErrorEnvelope(
        'JOB_SUBMIT_FAILED',
        500,
        {
          handler: request.handler,
          error: error instanceof Error ? error.message : String(error),
        },
        this.ctx,
        { timeMs }
      );
    }
  }

  /**
   * Schedule a recurring job
   */
  async schedule(request: ScheduledJobRequest): Promise<ScheduleHandle> {
    const startTime = Date.now();

    try {
      if (!this.cronScheduler) {
        throw toErrorEnvelope(
          'CRON_SCHEDULER_NOT_AVAILABLE',
          500,
          {
            message: 'CronScheduler not initialized',
            remediation: 'Ensure workflow-engine is properly configured',
          },
          this.ctx,
          { timeMs: Date.now() - startTime }
        );
      }

      this.logger.debug('Schedule job request', {
        handler: request.handler,
        schedule: request.schedule,
        priority: request.priority,
      });

      // 1. Check permissions
      const permissionCheck = checkSchedulePermission(
        this.callerManifest,
        request,
        this.ctx.pluginId
      );

      if (!permissionCheck.allow) {
        await emitAnalyticsEvent('job.schedule.denied', {
          caller: this.ctx.pluginId,
          handler: request.handler,
          reason: permissionCheck.reason,
        });

        throw toErrorEnvelope(
          ErrorCode.PLUGIN_PERMISSION_DENIED,
          403,
          {
            handler: request.handler,
            reason: permissionCheck.reason,
            remediation: permissionCheck.remediation,
          },
          this.ctx,
          { timeMs: Date.now() - startTime },
          this.callerManifest.permissions
        );
      }

      // 2. Check quotas
      const quotaChecks = await Promise.all([
        this.quotaTracker.checkScheduleQuota(),
        this.quotaTracker.checkMaxSchedulesQuota(),
      ]);

      for (const quotaCheck of quotaChecks) {
        if (!quotaCheck.allow) {
          await emitAnalyticsEvent('job.schedule.quota_exceeded', {
            caller: this.ctx.pluginId,
            handler: request.handler,
            reason: quotaCheck.reason,
            current: quotaCheck.current,
            limit: quotaCheck.limit,
          });

          throw toErrorEnvelope(
            ErrorCode.PLUGIN_QUOTA_EXCEEDED,
            429,
            {
              handler: request.handler,
              reason: quotaCheck.reason,
              current: quotaCheck.current,
              limit: quotaCheck.limit,
              remediation: quotaCheck.remediation,
            },
            this.ctx,
            { timeMs: Date.now() - startTime }
          );
        }
      }

      // 3. Register recurring job with CronScheduler
      const scheduleId = `sched-${this.createJobId()}`;

      const entry = await this.cronScheduler.register(
        scheduleId,
        this.ctx.pluginId,
        request.handler,
        request.schedule,
        request.input,
        {
          priority: request.priority,
          timeout: request.timeout,
          retries: request.retries,
          tags: request.tags,
          startAt: request.startAt,
          endAt: request.endAt,
          maxRuns: request.maxRuns,
        }
      );

      // 5. Increment quotas
      await this.quotaTracker.incrementQuota('schedule');
      await this.quotaTracker.incrementActiveSchedules();

      // 6. Emit analytics
      await emitAnalyticsEvent('job.schedule.success', {
        caller: this.ctx.pluginId,
        handler: request.handler,
        scheduleId,
        schedule: request.schedule,
      });

      this.logger.info('Job scheduled', {
        scheduleId,
        handler: request.handler,
        schedule: request.schedule,
      });

      // 7. Return handle
      return new ScheduleHandleImpl(scheduleId, this.cronScheduler);
    } catch (error) {
      const timeMs = Date.now() - startTime;

      // If already an error envelope, rethrow
      if (error && typeof error === 'object' && 'code' in error && 'http' in error) {
        throw error;
      }

      // Log error
      this.logger.error('Job schedule failed', {
        handler: request.handler,
        schedule: request.schedule,
        error: error instanceof Error ? error.message : String(error),
      });

      // Wrap in error envelope
      throw toErrorEnvelope(
        'JOB_SCHEDULE_FAILED',
        500,
        {
          handler: request.handler,
          schedule: request.schedule,
          error: error instanceof Error ? error.message : String(error),
        },
        this.ctx,
        { timeMs }
      );
    }
  }

  /**
   * Cancel a job
   */
  async cancel(jobId: string): Promise<void> {
    try {
      await this.workflowEngine.cancelRun(jobId);
      await this.quotaTracker.decrementConcurrent();

      await emitAnalyticsEvent('job.cancelled', {
        caller: this.ctx.pluginId,
        jobId,
      });

      this.logger.info('Job cancelled', { jobId });
    } catch (error) {
      this.logger.error('Job cancel failed', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get job status
   */
  async status(jobId: string): Promise<JobStatus> {
    try {
      const run = await this.workflowEngine.getRun(jobId);
      return this.mapStatus(run.status);
    } catch (error) {
      this.logger.error('Get job status failed', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * List jobs
   */
  async list(filter?: JobFilter): Promise<JobInfo[]> {
    try {
      // TODO: Implement proper filtering once workflow-engine supports it
      const runs = await this.workflowEngine.listRuns({
        trigger: { pluginId: this.ctx.pluginId },
      } as any);

      return runs.map((run) => this.mapRunToJobInfo(run));
    } catch (error) {
      this.logger.error('List jobs failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Map priority (1-10) to workflow priority (high/normal/low)
   */
  private mapPriority(priority?: number): 'high' | 'normal' | 'low' {
    const p = priority ?? 5;
    if (p >= 7) return 'high';
    if (p >= 4) return 'normal';
    return 'low';
  }

  /**
   * Map workflow status to job status
   */
  private mapStatus(status: string): JobStatus {
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
   * Map WorkflowRun to JobInfo
   */
  private mapRunToJobInfo(run: any): JobInfo {
    const handler = run.metadata?.handler || 'unknown';
    const createdAt = new Date(run.createdAt).getTime();
    const startedAt = run.startedAt ? new Date(run.startedAt).getTime() : undefined;
    const finishedAt = run.finishedAt ? new Date(run.finishedAt).getTime() : undefined;
    const executionTimeMs = finishedAt && startedAt ? finishedAt - startedAt : undefined;

    return {
      jobId: run.id,
      pluginId: this.ctx.pluginId,
      handler,
      status: this.mapStatus(run.status),
      priority: run.metadata?.priority ?? 5,
      createdAt,
      startedAt,
      finishedAt,
      executionTimeMs,
      tags: run.tags,
      error: run.status === 'failed' ? this.extractError(run) : undefined,
    };
  }

  /**
   * Extract error message from failed run
   */
  private extractError(run: any): string | undefined {
    const job = run.jobs?.[0];
    const step = job?.steps?.[0];
    return step?.result?.error?.message;
  }

  /**
   * Get health check status
   */
  async healthCheck() {
    if (!this.degradationController) {
      return {
        status: 'healthy',
        message: 'Degradation controller not enabled',
      };
    }

    return this.degradationController.healthCheck();
  }

  /**
   * Create unique job ID
   */
  private createJobId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
