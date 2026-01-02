/**
 * Host-specific context for V3 Plugin System
 *
 * Each entry point (CLI, REST, Workflow, Webhook) provides different context.
 * This is a discriminated union based on the 'host' field.
 */

/**
 * CLI host context
 */
export interface CliHostContext {
  readonly host: 'cli';
  /** Raw command line arguments */
  readonly argv: string[];
  /** Parsed flags */
  readonly flags: Record<string, unknown>;
}

/**
 * REST API host context
 */
export interface RestHostContext {
  readonly host: 'rest';
  /** HTTP method */
  readonly method: string;
  /** Request path */
  readonly path: string;
  /** Request headers */
  readonly headers?: Record<string, string>;
  /** Query parameters */
  readonly query?: Record<string, string>;
  /** Request body */
  readonly body?: unknown;
}

/**
 * Workflow host context
 */
export interface WorkflowHostContext {
  readonly host: 'workflow';
  /** Workflow definition ID */
  readonly workflowId: string;
  /** Workflow run ID */
  readonly runId: string;
  /** Job ID within the workflow run (optional - for multi-job workflows) */
  readonly jobId?: string;
  /** Current step ID */
  readonly stepId: string;
  /** Step execution attempt number (1-indexed, for retry tracking) */
  readonly attempt?: number;
  /** Step input data */
  readonly input?: unknown;
}

/**
 * Webhook host context
 */
export interface WebhookHostContext {
  readonly host: 'webhook';
  /** Event name */
  readonly event: string;
  /** Event source */
  readonly source?: string;
  /** Event payload */
  readonly payload?: unknown;
}

/**
 * Cron host context - for scheduled plugin execution
 *
 * Unlike Workflow (user orchestration), Cron is plugin-owned scheduling.
 * The plugin defines WHEN and HOW OFTEN it runs via manifest.
 */
export interface CronHostContext {
  readonly host: 'cron';
  /** Cron job ID from manifest */
  readonly cronId: string;
  /** Cron schedule expression (e.g., "0 * * * *") */
  readonly schedule: string;
  /** When this run was scheduled (ISO string) */
  readonly scheduledAt: string;
  /** Previous run timestamp (ISO string, optional) */
  readonly lastRunAt?: string;
}

/**
 * Discriminated union of all host contexts
 */
export type HostContext =
  | CliHostContext
  | RestHostContext
  | WorkflowHostContext
  | WebhookHostContext
  | CronHostContext;

/**
 * Host type literal
 */
export type HostType = HostContext['host'];
