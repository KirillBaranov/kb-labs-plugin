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
  /** Current step ID */
  readonly stepId: string;
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
 * Discriminated union of all host contexts
 */
export type HostContext =
  | CliHostContext
  | RestHostContext
  | WorkflowHostContext
  | WebhookHostContext;

/**
 * Host type literal
 */
export type HostType = HostContext['host'];
