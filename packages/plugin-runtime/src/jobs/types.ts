/**
 * @module @kb-labs/plugin-runtime/jobs/types
 * Type definitions for JobBroker
 */

/**
 * Background job request (one-time execution)
 */
export interface BackgroundJobRequest {
  /** Handler path to execute (e.g., "handlers/sync-clickup") */
  handler: string;

  /** Input data for the handler */
  input?: unknown;

  /** Job priority (1-10, default: 5, higher = more important) */
  priority?: number;

  /** Delay before execution in milliseconds */
  delay?: number;

  /** Maximum execution time in milliseconds */
  timeout?: number;

  /** Number of retry attempts on failure */
  retries?: number;

  /** Tags for filtering/grouping jobs */
  tags?: string[];
}

/**
 * Scheduled job request (recurring execution)
 */
export interface ScheduledJobRequest extends BackgroundJobRequest {
  /**
   * Schedule specification
   * - Cron expression: "0 9 * * *" (every day at 9am)
   * - Interval: "5m", "1h", "30s" (every 5 minutes, 1 hour, 30 seconds)
   */
  schedule: string;

  /** Start timestamp (when to begin scheduling, default: now) */
  startAt?: number;

  /** End timestamp (when to stop scheduling) */
  endAt?: number;

  /** Maximum number of executions */
  maxRuns?: number;
}

/**
 * Job status
 */
export type JobStatus =
  | 'pending'    // Job queued, not started
  | 'running'    // Job currently executing
  | 'success'    // Job completed successfully
  | 'failed'     // Job failed
  | 'cancelled'  // Job was cancelled
  | 'timeout';   // Job timed out

/**
 * Job information
 */
export interface JobInfo {
  /** Job ID */
  jobId: string;

  /** Plugin that created the job */
  pluginId: string;

  /** Handler being executed */
  handler: string;

  /** Current status */
  status: JobStatus;

  /** Priority */
  priority: number;

  /** Created timestamp */
  createdAt: number;

  /** Started timestamp */
  startedAt?: number;

  /** Finished timestamp */
  finishedAt?: number;

  /** Execution time in milliseconds */
  executionTimeMs?: number;

  /** Tags */
  tags?: string[];

  /** Error message if failed */
  error?: string;
}

/**
 * Job execution result
 */
export interface JobResult<T = unknown> {
  /** Success flag */
  ok: boolean;

  /** Result data if successful */
  data?: T;

  /** Error if failed */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };

  /** Execution metrics */
  metrics: {
    timeMs: number;
    retries?: number;
  };
}

/**
 * Job handle (returned by submit())
 */
export interface JobHandle<T = unknown> {
  /** Job ID */
  jobId: string;

  /** Handle type */
  type: 'immediate';

  /** Cancel the job */
  cancel(): Promise<void>;

  /** Get current status */
  status(): Promise<JobStatus>;

  /** Wait for job completion and get result */
  wait(): Promise<JobResult<T>>;

  /** Stream logs (async iterator) */
  logs(): AsyncIterableIterator<LogEntry>;
}

/**
 * Schedule status
 */
export type ScheduleStatus =
  | 'active'     // Schedule is active
  | 'paused'     // Schedule is paused
  | 'expired'    // Schedule has expired (endAt reached)
  | 'completed'  // Schedule completed (maxRuns reached)
  | 'cancelled'; // Schedule was cancelled

/**
 * Schedule information
 */
export interface ScheduleInfo {
  /** Schedule ID */
  scheduleId: string;

  /** Plugin that created the schedule */
  pluginId: string;

  /** Handler being executed */
  handler: string;

  /** Schedule specification */
  schedule: string;

  /** Current status */
  status: ScheduleStatus;

  /** Created timestamp */
  createdAt: number;

  /** Last run timestamp */
  lastRun?: number;

  /** Next run timestamp */
  nextRun?: number;

  /** Run count */
  runCount: number;

  /** Max runs limit */
  maxRuns?: number;

  /** Start timestamp */
  startAt?: number;

  /** End timestamp */
  endAt?: number;
}

/**
 * Schedule handle (returned by schedule())
 */
export interface ScheduleHandle {
  /** Schedule ID */
  scheduleId: string;

  /** Handle type */
  type: 'scheduled';

  /** Cancel the schedule (no more runs) */
  cancel(): Promise<void>;

  /** Pause the schedule */
  pause(): Promise<void>;

  /** Resume the schedule */
  resume(): Promise<void>;

  /** Get current status */
  status(): Promise<ScheduleStatus>;

  /** Get schedule info */
  info(): Promise<ScheduleInfo>;

  /** List execution history */
  listRuns(): Promise<JobInfo[]>;

  /** Get next scheduled run time */
  nextRun(): Promise<Date | null>;
}

/**
 * Job filter for listing jobs
 */
export interface JobFilter {
  /** Filter by status */
  status?: JobStatus | JobStatus[];

  /** Filter by tags */
  tags?: string[];

  /** Filter by creation time (after) */
  createdAfter?: number;

  /** Filter by creation time (before) */
  createdBefore?: number;

  /** Limit number of results */
  limit?: number;
}

/**
 * Log entry
 */
export interface LogEntry {
  /** Timestamp */
  timestamp: number;

  /** Log level */
  level: 'debug' | 'info' | 'warn' | 'error';

  /** Log message */
  message: string;

  /** Additional metadata */
  meta?: Record<string, unknown>;
}

/**
 * Parsed schedule
 */
export interface ParsedSchedule {
  /** Schedule type */
  type: 'cron' | 'interval';

  /** Cron expression (if type is 'cron') */
  expression?: string;

  /** Interval in milliseconds (if type is 'interval') */
  ms?: number;

  /** Next run timestamp */
  nextRun: number;
}

/**
 * Schedule entry (internal)
 */
export interface ScheduleEntry {
  /** Schedule ID */
  scheduleId: string;

  /** Plugin ID */
  pluginId: string;

  /** Handler path */
  handler: string;

  /** Input data */
  input?: unknown;

  /** Parsed schedule */
  schedule: ParsedSchedule;

  /** Priority */
  priority?: number;

  /** Timeout */
  timeout?: number;

  /** Retries */
  retries?: number;

  /** Start timestamp */
  startAt?: number;

  /** End timestamp */
  endAt?: number;

  /** Max runs */
  maxRuns?: number;

  /** Created timestamp */
  createdAt: number;

  /** Last run timestamp */
  lastRun: number | null;

  /** Run count */
  runCount: number;

  /** Status */
  status: ScheduleStatus;

  /** On tick callback */
  onTick: () => Promise<void>;
}

/**
 * Schedule configuration
 */
export interface ScheduleConfig {
  scheduleId: string;
  pluginId: string;
  handler: string;
  input?: unknown;
  schedule: ParsedSchedule;
  priority?: number;
  timeout?: number;
  retries?: number;
  startAt?: number;
  endAt?: number;
  maxRuns?: number;
  onTick: () => Promise<void>;
}
