/**
 * Jobs API implementation
 *
 * Adapter from simplified JobsAPI to full IJobScheduler interface.
 */

import type {
  JobsAPI,
  JobSubmission,
  JobStatusInfo,
  JobListFilter,
  JobWaitOptions,
  PermissionSpec,
} from '@kb-labs/plugin-contracts';
import type { IJobScheduler, JobHandle } from '@kb-labs/core-platform';

export interface CreateJobsAPIOptions {
  tenantId?: string;
  scheduler: IJobScheduler;
  permissions?: PermissionSpec;
}

/**
 * Check if job operation is allowed by permissions
 */
function checkJobPermission(
  permissions: PermissionSpec | undefined,
  operation: 'submit' | 'schedule' | 'list' | 'cancel',
  jobType?: string
): void {
  const jobPerms = permissions?.platform?.jobs;

  // If jobs is false or undefined, no access
  if (jobPerms === false || jobPerms === undefined) {
    throw new Error('Job scheduler access denied: missing platform.jobs permission');
  }

  // If jobs is true, all operations allowed
  if (jobPerms === true) {
    return;
  }

  // If jobs is object, check specific operation
  if (typeof jobPerms === 'object') {
    if (!jobPerms[operation]) {
      throw new Error(
        `Job operation '${operation}' denied: missing platform.jobs.${operation} permission`
      );
    }

    // Check job type scope if specified
    if (jobType && jobPerms.types) {
      const allowed = jobPerms.types.some(pattern => {
        if (pattern === '*') return true;
        if (pattern.endsWith('*')) {
          const prefix = pattern.slice(0, -1);
          return jobType.startsWith(prefix);
        }
        return pattern === jobType;
      });

      if (!allowed) {
        throw new Error(`Job type '${jobType}' access denied: not in allowed types scope`);
      }
    }
  }
}

/**
 * Create JobsAPI adapter
 *
 * Maps simplified plugin API to full job scheduler interface.
 */
export function createJobsAPI(options: CreateJobsAPIOptions): JobsAPI {
  const { tenantId, scheduler, permissions } = options;

  return {
    async submit(job: JobSubmission): Promise<string> {
      checkJobPermission(permissions, 'submit', job.type);

      const handle = await scheduler.submit({
        type: job.type,
        payload: job.payload,
        tenantId,
        priority: job.priority,
        maxRetries: job.maxRetries,
        timeout: job.timeout,
        runAt: job.runAt,
        idempotencyKey: job.idempotencyKey,
      });

      return handle.id;
    },

    async schedule(job: JobSubmission, schedule: string | Date): Promise<string> {
      checkJobPermission(permissions, 'schedule', job.type);

      const handle = await scheduler.schedule(
        {
          type: job.type,
          payload: job.payload,
          tenantId,
          priority: job.priority,
          maxRetries: job.maxRetries,
          timeout: job.timeout,
          idempotencyKey: job.idempotencyKey,
        },
        schedule
      );

      return handle.id;
    },

    async wait(jobId: string, options?: JobWaitOptions): Promise<unknown> {
      const timeout = options?.timeout ?? 300000; // 5min default
      const pollInterval = options?.pollInterval ?? 1000; // 1s default
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const handle = await scheduler.getStatus(jobId);

        if (!handle) {
          throw new Error(`Job not found: ${jobId}`);
        }

        if (handle.status === 'completed') {
          return handle.result;
        }

        if (handle.status === 'failed') {
          throw new Error(`Job failed: ${handle.error ?? 'Unknown error'}`);
        }

        if (handle.status === 'cancelled') {
          throw new Error(`Job cancelled`);
        }

        // Still running, poll again after interval
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }

      throw new Error(`Job wait timeout after ${timeout}ms`);
    },

    async status(jobId: string): Promise<JobStatusInfo | null> {
      checkJobPermission(permissions, 'list');

      const handle = await scheduler.getStatus(jobId);

      if (!handle) {
        return null;
      }

      return mapJobHandleToStatus(handle);
    },

    async cancel(jobId: string): Promise<boolean> {
      checkJobPermission(permissions, 'cancel');
      return scheduler.cancel(jobId);
    },

    async list(filter?: JobListFilter): Promise<JobStatusInfo[]> {
      checkJobPermission(permissions, 'list');

      const handles = await scheduler.list({
        type: filter?.type,
        tenantId, // Use adapter's tenantId, not from filter
        status: filter?.status,
        limit: filter?.limit,
        offset: filter?.offset,
      });

      return handles.map(mapJobHandleToStatus);
    },
  };
}

/**
 * Map internal JobHandle to simplified JobStatusInfo
 */
function mapJobHandleToStatus(handle: JobHandle): JobStatusInfo {
  return {
    id: handle.id,
    type: handle.type,
    status: handle.status,
    progress: handle.progress,
    result: handle.result,
    error: handle.error,
    createdAt: handle.createdAt,
    startedAt: handle.startedAt,
    completedAt: handle.completedAt,
  };
}

/**
 * Create a no-op jobs API (for when job scheduler is not available)
 */
export function createNoopJobsAPI(): JobsAPI {
  const notAvailable = async (): Promise<never> => {
    throw new Error('Job scheduler not available');
  };

  return {
    submit: notAvailable,
    schedule: notAvailable,
    wait: notAvailable,
    status: async () => null,
    cancel: async () => false,
    list: async () => [],
  };
}
