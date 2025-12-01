# JobBroker & CronScheduler API Documentation

## Overview

The JobBroker and CronScheduler provide a comprehensive system for running background jobs and scheduled tasks within the KB Labs plugin ecosystem. This system is built on top of the workflow-engine infrastructure and provides:

- **Background Jobs** - One-time asynchronous tasks with configurable priority, delays, retries, and timeouts
- **Scheduled Jobs** - Recurring tasks with cron expressions or interval syntax
- **Adaptive Throttling** - Automatic degradation based on system load (CPU, memory, queue depth)
- **Quota Management** - Time-window based limits to prevent abuse
- **Distributed Scaling** - Redis-based coordination for multi-instance deployments

## Table of Contents

1. [Background Jobs](#background-jobs)
2. [Scheduled Jobs](#scheduled-jobs)
3. [Permissions](#permissions)
4. [Quotas](#quotas)
5. [Adaptive Throttling](#adaptive-throttling)
6. [Error Handling](#error-handling)
7. [Examples](#examples)
8. [Configuration](#configuration)

---

## Background Jobs

### Submit a Background Job

Submit a one-time asynchronous job for execution.

```typescript
const handle = await ctx.jobs.submit({
  handler: 'handlers/process-data.ts',
  input: { dataId: '12345' },
  priority: 8,        // 1-10, default: 5
  delay: 5000,        // 5s delay before execution
  timeout: 60000,     // 1 minute timeout
  retries: 3,         // Retry 3 times on failure
  tags: ['data-processing', 'batch']
});

// Check status
const status = await handle.getStatus();
console.log(status); // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

// Get result (waits for completion)
const result = await handle.getResult();

// Cancel the job
await handle.cancel();
```

### BackgroundJobRequest Interface

```typescript
interface BackgroundJobRequest {
  /**
   * Path to handler function (must start with "handlers/")
   * Example: "handlers/process-data.ts"
   */
  handler: string;

  /**
   * Input data passed to the handler
   */
  input?: unknown;

  /**
   * Priority (1-10)
   * - 1-3: low priority
   * - 4-7: normal priority
   * - 8-10: high priority
   * Default: 5
   */
  priority?: number;

  /**
   * Delay before execution (milliseconds)
   * Default: 0 (immediate)
   */
  delay?: number;

  /**
   * Execution timeout (milliseconds)
   * Must be within manifest limits
   */
  timeout?: number;

  /**
   * Number of retry attempts on failure
   * Default: 0 (no retries)
   */
  retries?: number;

  /**
   * Optional tags for filtering/monitoring
   */
  tags?: string[];
}
```

### JobHandle Interface

```typescript
interface JobHandle {
  /** Unique job identifier */
  id: string;

  /** Get current job status */
  getStatus(): Promise<JobStatus>;

  /** Get job result (waits for completion) */
  getResult(): Promise<JobResult>;

  /** Cancel the job */
  cancel(): Promise<void>;

  /** Get job metadata */
  getInfo(): Promise<JobInfo>;

  /** Get job logs */
  getLogs(): Promise<LogEntry[]>;
}
```

---

## Scheduled Jobs

### Schedule a Recurring Job

Schedule a job to run on a recurring basis using cron expressions or interval syntax.

```typescript
const handle = await ctx.jobs.schedule({
  handler: 'handlers/daily-report.ts',
  schedule: '0 9 * * *',  // Every day at 9 AM
  input: { reportType: 'daily' },
  priority: 7,
  timeout: 300000,  // 5 minutes
  startAt: Date.now() + 86400000,  // Start tomorrow
  maxRuns: 30  // Stop after 30 executions
});

// Pause/resume
await handle.pause();
await handle.resume();

// Get next run time
const nextRun = await handle.getNextRun();
console.log(new Date(nextRun));

// Cancel schedule
await handle.cancel();
```

### ScheduledJobRequest Interface

```typescript
interface ScheduledJobRequest extends BackgroundJobRequest {
  /**
   * Schedule expression (cron or interval)
   *
   * Cron examples:
   * - "0 9 * * *" - Every day at 9 AM
   * - "*/15 * * * *" - Every 15 minutes
   * - "0 0 * * 0" - Every Sunday at midnight
   *
   * Interval examples:
   * - "5m" - Every 5 minutes
   * - "1h" - Every hour
   * - "30s" - Every 30 seconds
   * - "1d" - Every day
   */
  schedule: string;

  /**
   * Start time (Unix timestamp in ms)
   * Schedule won't trigger before this time
   */
  startAt?: number;

  /**
   * End time (Unix timestamp in ms)
   * Schedule will be cancelled after this time
   */
  endAt?: number;

  /**
   * Maximum number of executions
   * Schedule will be cancelled after this many runs
   */
  maxRuns?: number;
}
```

### ScheduleHandle Interface

```typescript
interface ScheduleHandle {
  /** Unique schedule identifier */
  id: string;

  /** Pause the schedule (jobs won't trigger) */
  pause(): Promise<void>;

  /** Resume the schedule */
  resume(): Promise<void>;

  /** Cancel the schedule permanently */
  cancel(): Promise<void>;

  /** Get schedule status */
  getStatus(): Promise<ScheduleStatus>;

  /** Get schedule metadata */
  getInfo(): Promise<ScheduleInfo>;

  /** Get next scheduled run time */
  getNextRun(): Promise<number>;

  /** List triggered jobs from this schedule */
  listJobs(filter?: JobFilter): Promise<JobInfo[]>;
}
```

### Cron Syntax Reference

#### Standard Cron Format

```
┌─────── minute (0 - 59)
│ ┌───── hour (0 - 23)
│ │ ┌─── day of month (1 - 31)
│ │ │ ┌─ month (1 - 12)
│ │ │ │ ┌ day of week (0 - 6, Sunday = 0)
│ │ │ │ │
* * * * *
```

**Examples:**
- `0 9 * * *` - Every day at 9:00 AM
- `*/15 * * * *` - Every 15 minutes
- `0 0 * * 0` - Every Sunday at midnight
- `0 2 1 * *` - First day of every month at 2:00 AM
- `30 14 * * 1-5` - Weekdays at 2:30 PM

#### Interval Format

Simple interval strings for common use cases:

- `30s` - Every 30 seconds
- `5m` - Every 5 minutes
- `1h` - Every hour
- `1d` - Every day

**Supported units:** `s` (seconds), `m` (minutes), `h` (hours), `d` (days)

---

## Permissions

Plugins must declare job permissions in their manifest to use the JobBroker.

### Manifest Configuration

```typescript
// manifest.v2.ts
export default {
  // ... other fields
  permissions: {
    jobs: {
      // Background job submission
      submit: {
        handlers: ['handlers/*.ts'],  // Allowed handler patterns
        quotas: {
          perMinute: 100,   // Max 100 jobs/minute
          perHour: 1000,    // Max 1000 jobs/hour
          perDay: 10000     // Max 10000 jobs/day
        },
        timeoutLimits: {
          min: 1000,        // Min timeout: 1s
          max: 600000       // Max timeout: 10min
        }
      },

      // Scheduled job creation
      schedule: {
        handlers: ['handlers/*.ts'],
        quotas: {
          perMinute: 10,    // Max 10 schedules/minute
          perHour: 100,     // Max 100 schedules/hour
          perDay: 500       // Max 500 schedules/day
        },
        intervalLimits: {
          min: 60000,       // Min interval: 1 minute
          max: 86400000     // Max interval: 1 day
        }
      }
    }
  }
} satisfies ManifestV2;
```

### Permission Validation

The JobBroker validates permissions before executing operations:

1. **Handler Path Validation** - Handler must match declared patterns
2. **Quota Checking** - Operation must be within quota limits
3. **Timeout Validation** - Timeout must be within declared limits (submit)
4. **Interval Validation** - Interval must be within declared limits (schedule)

---

## Quotas

Quotas prevent resource abuse and ensure fair usage across plugins.

### How Quotas Work

- **Time-window based** - Tracked using Redis sorted sets
- **Sliding windows** - Old entries automatically expire
- **Per-operation type** - Separate quotas for submit and schedule
- **Plugin-scoped** - Each plugin has independent quotas

### Quota Enforcement

```typescript
// Submit job
try {
  const handle = await ctx.jobs.submit({
    handler: 'handlers/process.ts',
    input: { data: 'test' }
  });
} catch (error) {
  if (error.code === 'JOB_QUOTA_EXCEEDED') {
    console.error('Submit quota exceeded:', error.details);
    // Error includes: limit, current, window, resetAt
  }
}
```

### Quota Types

- **perMinute** - Maximum operations per 60-second window
- **perHour** - Maximum operations per 3600-second window
- **perDay** - Maximum operations per 86400-second window

---

## Adaptive Throttling

The system automatically adjusts job submission based on resource availability.

### Degradation States

The DegradationController uses a state machine with three states:

1. **normal** - System operating normally
   - No delays or restrictions
   - All jobs accepted immediately

2. **degraded** - System under moderate load
   - Configurable delay applied (default: 1 second)
   - Schedules may be paused (configurable)
   - All jobs still accepted

3. **critical** - System overloaded
   - Longer delay applied (default: 5 seconds)
   - New jobs may be rejected (configurable)
   - Schedules paused (configurable)

### State Transitions

```
normal ─┐
        │ metrics exceed degraded threshold
        ├──> degraded ─┐
        │              │ metrics exceed critical threshold
        │              ├──> critical
        │              │
        │              │ metrics below degraded threshold
        │              └──> degraded
        │
        │ metrics below normal threshold
        └──> normal
```

### Monitored Metrics

- **CPU Usage** - Average across all cores
- **Memory Usage** - System memory percentage
- **Queue Depth** - Pending jobs in all priority queues
- **Active Jobs** - Currently running workflows

### Default Thresholds

```typescript
{
  cpu: {
    degraded: 70,   // Enter degraded at 70% CPU
    critical: 90,   // Enter critical at 90% CPU
    normal: 50      // Return to normal below 50% CPU
  },
  memory: {
    degraded: 75,   // Enter degraded at 75% memory
    critical: 90,   // Enter critical at 90% memory
    normal: 60      // Return to normal below 60% memory
  },
  queueDepth: {
    degraded: 100,  // Enter degraded at 100 pending jobs
    critical: 500,  // Enter critical at 500 pending jobs
    normal: 50      // Return to normal below 50 pending jobs
  }
}
```

### Adaptive Behavior

When submitting jobs during degradation:

```typescript
// normal state - immediate execution
await ctx.jobs.submit({ ... }); // No delay

// degraded state - 1 second delay
await ctx.jobs.submit({ ... }); // Delayed 1 second

// critical state - rejected or 5 second delay
try {
  await ctx.jobs.submit({ ... }); // May throw error
} catch (error) {
  if (error.code === 'JOB_SUBMIT_REJECTED_DEGRADED') {
    console.error('System overloaded, job rejected');
  }
}
```

### Health Monitoring

Check system health programmatically:

```typescript
// Get health status
const health = await ctx.jobs.healthCheck();

console.log(health);
// {
//   status: 'degraded',
//   state: 'degraded',
//   metrics: {
//     cpuUsage: 75.2,
//     memoryUsage: 68.5,
//     queueDepth: 150,
//     activeJobs: 45,
//     timestamp: 1701234567890
//   },
//   thresholds: { ... },
//   recommendations: [
//     'High CPU usage (75.2%). Consider scaling horizontally.',
//     'System in DEGRADED state. Job submissions are delayed.'
//   ],
//   timestamp: 1701234567890
// }
```

---

## Error Handling

### Common Error Codes

```typescript
// Permission errors
'JOB_PERMISSION_DENIED'          // Handler not allowed by manifest
'JOB_HANDLER_INVALID'            // Invalid handler path

// Quota errors
'JOB_QUOTA_EXCEEDED'             // Quota limit reached

// Timeout errors
'JOB_TIMEOUT_EXCEEDED'           // Timeout exceeds manifest limit
'JOB_TIMEOUT_BELOW_MIN'          // Timeout below manifest minimum

// Interval errors
'JOB_INTERVAL_EXCEEDED'          // Interval exceeds manifest limit
'JOB_INTERVAL_BELOW_MIN'         // Interval below manifest minimum

// Cron errors
'JOB_SCHEDULE_INVALID'           // Invalid cron expression or interval

// Degradation errors
'JOB_SUBMIT_REJECTED_DEGRADED'   // System in critical state, job rejected

// Execution errors
'JOB_EXECUTION_FAILED'           // Handler execution failed
'JOB_TIMEOUT'                    // Job timed out
'JOB_CANCELLED'                  // Job was cancelled
```

### Error Details

All errors include detailed context:

```typescript
catch (error) {
  console.log(error.code);        // Error code
  console.log(error.message);     // Human-readable message
  console.log(error.details);     // Structured details
  console.log(error.statusCode);  // HTTP-style status code
}
```

---

## Examples

### Example 1: Daily Report Generation

```typescript
// handlers/daily-report.ts
export default async function generateReport(ctx: PluginContext, input: any) {
  const { reportType } = input;

  // Generate report data
  const data = await fetchReportData(reportType);

  // Save as artifact
  await ctx.artifacts.write('daily-report', {
    type: reportType,
    data,
    timestamp: Date.now()
  });

  return { success: true, recordCount: data.length };
}

// Schedule in plugin code
const handle = await ctx.jobs.schedule({
  handler: 'handlers/daily-report.ts',
  schedule: '0 9 * * *',  // 9 AM daily
  input: { reportType: 'sales' },
  priority: 7,
  timeout: 300000  // 5 minutes
});
```

### Example 2: Batch Data Processing

```typescript
// Process large dataset in background
async function processBatch(ctx: PluginContext, items: any[]) {
  const batchSize = 100;
  const jobs: JobHandle[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    const handle = await ctx.jobs.submit({
      handler: 'handlers/process-items.ts',
      input: { batch },
      priority: 5,
      timeout: 60000,
      retries: 2,
      tags: ['batch-processing', `batch-${i / batchSize}`]
    });

    jobs.push(handle);
  }

  // Wait for all batches
  const results = await Promise.all(
    jobs.map(job => job.getResult())
  );

  return results;
}
```

### Example 3: Periodic Cache Refresh

```typescript
// Refresh cache every 5 minutes
await ctx.jobs.schedule({
  handler: 'handlers/refresh-cache.ts',
  schedule: '5m',  // Every 5 minutes
  input: { cacheKey: 'api-data' },
  priority: 6,
  timeout: 30000  // 30 seconds
});
```

### Example 4: Monitoring System Health

```typescript
// Check health before submitting critical job
async function submitCriticalJob(ctx: PluginContext) {
  const health = await ctx.jobs.healthCheck();

  if (health.state === 'critical') {
    // Wait for system to recover
    console.warn('System overloaded, waiting...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    return submitCriticalJob(ctx); // Retry
  }

  // System healthy, submit job
  return ctx.jobs.submit({
    handler: 'handlers/critical-task.ts',
    priority: 10,  // Highest priority
    timeout: 120000
  });
}
```

### Example 5: Job Chaining

```typescript
// Chain jobs - run second job after first completes
async function chainJobs(ctx: PluginContext) {
  // Submit first job
  const job1 = await ctx.jobs.submit({
    handler: 'handlers/step1.ts',
    input: { data: 'initial' }
  });

  // Wait for completion
  const result1 = await job1.getResult();

  // Submit second job with result from first
  const job2 = await ctx.jobs.submit({
    handler: 'handlers/step2.ts',
    input: { previousResult: result1 }
  });

  return job2.getResult();
}
```

---

## Configuration

### WorkflowEngine Configuration

```typescript
import { WorkflowEngine, createRedisClientFactory } from '@kb-labs/workflow-engine';
import { CronScheduler } from '@kb-labs/plugin-runtime';
import { DegradationController } from '@kb-labs/plugin-runtime';

// Create Redis client
const redis = createRedisClientFactory({
  host: 'localhost',
  port: 6379
});

// Create degradation controller
const degradation = new DegradationController(redis, {
  thresholds: {
    cpu: { degraded: 70, critical: 90, normal: 50 },
    memory: { degraded: 75, critical: 90, normal: 60 },
    queueDepth: { degraded: 100, critical: 500, normal: 50 }
  },
  actions: {
    degradedDelay: 1000,           // 1s delay when degraded
    criticalDelay: 5000,            // 5s delay when critical
    rejectOnCritical: true,         // Reject new jobs in critical
    pauseSchedulesOnDegraded: false,
    pauseSchedulesOnCritical: true
  },
  metricsIntervalMs: 10000,  // Collect metrics every 10s
  debounceMs: 30000          // 30s debounce for state changes
});

// Create cron scheduler
const cron = new CronScheduler(redis, {
  tickInterval: 5000,  // Check for due jobs every 5s
  timezone: 'UTC'
});

// Create workflow engine
const engine = new WorkflowEngine(redis, {
  cronScheduler: cron,
  degradation: degradation
});

// Start metrics collection
degradation.start();
```

### Plugin Manifest Configuration

```typescript
// manifest.v2.ts
export default {
  name: 'my-plugin',
  version: '1.0.0',

  permissions: {
    jobs: {
      submit: {
        handlers: [
          'handlers/process-*.ts',
          'handlers/batch/*.ts'
        ],
        quotas: {
          perMinute: 100,
          perHour: 1000,
          perDay: 10000
        },
        timeoutLimits: {
          min: 1000,      // 1 second
          max: 600000     // 10 minutes
        }
      },

      schedule: {
        handlers: [
          'handlers/cron-*.ts',
          'handlers/scheduled/*.ts'
        ],
        quotas: {
          perMinute: 10,
          perHour: 100,
          perDay: 500
        },
        intervalLimits: {
          min: 60000,     // 1 minute
          max: 86400000   // 1 day
        }
      }
    }
  }
} satisfies ManifestV2;
```

### Runtime Context

JobBroker is available via PluginContext:

```typescript
// In your plugin handler
export default async function handler(ctx: PluginContext, input: any) {
  // ctx.jobs is the JobBroker instance

  // Submit background job
  const job = await ctx.jobs.submit({ ... });

  // Schedule recurring job
  const schedule = await ctx.jobs.schedule({ ... });

  // Check system health
  const health = await ctx.jobs.healthCheck();

  return { success: true };
}
```

---

## Advanced Topics

### Distributed Scaling

The JobBroker and CronScheduler are designed for distributed deployments:

- **Redis-based coordination** - All state stored in Redis
- **Pub/sub for triggers** - Cron jobs published to all instances
- **Shared quota tracking** - Quotas enforced across all instances
- **Leader election** - Only one instance runs the cron ticker

### Performance Considerations

- **Priority Queues** - Use priority (1-10) to ensure critical jobs run first
- **Batch Processing** - Submit multiple small jobs instead of one large job
- **Timeout Tuning** - Set appropriate timeouts to free up resources
- **Retry Strategy** - Use retries for transient failures only
- **Tag Usage** - Use tags for monitoring and filtering, but avoid excessive tags

### Monitoring and Observability

- **Job Logs** - Access via `handle.getLogs()`
- **Job Metrics** - Track via analytics events
- **System Health** - Monitor via `healthCheck()`
- **Redis Events** - Subscribe to `kb:degradation:events` for state changes

---

## API Reference Summary

### JobBroker

```typescript
class JobBroker {
  submit(request: BackgroundJobRequest): Promise<JobHandle>
  schedule(request: ScheduledJobRequest): Promise<ScheduleHandle>
  healthCheck(): Promise<HealthCheckResult>
}
```

### JobHandle

```typescript
interface JobHandle {
  id: string
  getStatus(): Promise<JobStatus>
  getResult(): Promise<JobResult>
  cancel(): Promise<void>
  getInfo(): Promise<JobInfo>
  getLogs(): Promise<LogEntry[]>
}
```

### ScheduleHandle

```typescript
interface ScheduleHandle {
  id: string
  pause(): Promise<void>
  resume(): Promise<void>
  cancel(): Promise<void>
  getStatus(): Promise<ScheduleStatus>
  getInfo(): Promise<ScheduleInfo>
  getNextRun(): Promise<number>
  listJobs(filter?: JobFilter): Promise<JobInfo[]>
}
```

### DegradationController

```typescript
class DegradationController {
  start(): void
  stop(): void
  getState(): DegradationState
  getMetrics(): SystemMetrics | null
  getSubmitDelay(): number
  shouldRejectSubmit(): boolean
  shouldPauseSchedules(): boolean
  healthCheck(): Promise<HealthCheckResult>
}
```

### CronScheduler

```typescript
class CronScheduler {
  register(entry: ScheduleEntry): Promise<string>
  cancel(scheduleId: string): Promise<void>
  pause(scheduleId: string): Promise<void>
  resume(scheduleId: string): Promise<void>
  getSchedule(scheduleId: string): Promise<ScheduleEntry | null>
  listSchedules(): Promise<ScheduleEntry[]>
}
```

---

## See Also

- [Architecture Decision Record](../../docs/adr/ADR-0034-job-broker-cron-scheduler.md)
- [Plugin System Documentation](../../../docs/plugin-system-architecture.md)
- [Workflow Engine Documentation](../../../../kb-labs-workflow/packages/workflow-engine/README.md)
- [Manifest Schema](../../manifest/README.md)

---

**Last Updated:** 2025-11-28
**Version:** 1.0.0
