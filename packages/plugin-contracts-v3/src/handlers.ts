/**
 * Handler signatures for V3 Plugin System
 *
 * Defines how plugin handlers are structured and invoked.
 */

import type { PluginContextV3 } from './context.js';

/**
 * Command handler result
 */
export interface CommandResult<T = unknown> {
  /**
   * Structured result data (optional)
   */
  data?: T;

  /**
   * Exit code (0 = success, non-zero = error)
   */
  exitCode?: number;
}

/**
 * Command handler function signature
 */
export type CommandHandler<TInput = unknown, TOutput = unknown, TConfig = unknown> = (
  ctx: PluginContextV3<TConfig>,
  input: TInput
) => Promise<CommandResult<TOutput> | void>;

/**
 * Command definition
 */
export interface CommandDefinition<TInput = unknown, TOutput = unknown, TConfig = unknown> {
  /**
   * Handler function
   */
  execute: CommandHandler<TInput, TOutput, TConfig>;

  /**
   * Input schema (JSON Schema or Zod-like)
   */
  input?: unknown;

  /**
   * Output schema (JSON Schema or Zod-like)
   */
  output?: unknown;

  /**
   * Command metadata
   */
  meta?: {
    /**
     * Command description
     */
    description?: string;

    /**
     * Usage examples
     */
    examples?: string[];

    /**
     * Whether command is hidden from help
     */
    hidden?: boolean;

    /**
     * Deprecation notice
     */
    deprecated?: string;
  };
}

/**
 * REST endpoint handler function signature
 */
export type RestHandler<TBody = unknown, TResponse = unknown, TConfig = unknown> = (
  ctx: PluginContextV3<TConfig>,
  request: RestRequest<TBody>
) => Promise<RestResponse<TResponse>>;

/**
 * REST request
 */
export interface RestRequest<TBody = unknown> {
  /**
   * HTTP method
   */
  method: string;

  /**
   * Request path
   */
  path: string;

  /**
   * Path parameters
   */
  params: Record<string, string>;

  /**
   * Query parameters
   */
  query: Record<string, string>;

  /**
   * Request headers
   */
  headers: Record<string, string>;

  /**
   * Request body
   */
  body: TBody;
}

/**
 * REST response
 */
export interface RestResponse<T = unknown> {
  /**
   * HTTP status code
   */
  status: number;

  /**
   * Response body
   */
  body?: T;

  /**
   * Response headers
   */
  headers?: Record<string, string>;
}

/**
 * REST endpoint definition
 */
export interface RestDefinition<TBody = unknown, TResponse = unknown, TConfig = unknown> {
  /**
   * Handler function
   */
  handler: RestHandler<TBody, TResponse, TConfig>;

  /**
   * Request body schema
   */
  body?: unknown;

  /**
   * Response schema
   */
  response?: unknown;

  /**
   * Endpoint metadata
   */
  meta?: {
    /**
     * Endpoint description
     */
    description?: string;

    /**
     * Tags for OpenAPI
     */
    tags?: string[];
  };
}

/**
 * Workflow action handler function signature
 */
export type WorkflowHandler<TInput = unknown, TOutput = unknown, TConfig = unknown> = (
  ctx: PluginContextV3<TConfig>,
  input: TInput
) => Promise<TOutput>;

/**
 * Workflow action definition
 */
export interface WorkflowDefinition<TInput = unknown, TOutput = unknown, TConfig = unknown> {
  /**
   * Handler function
   */
  execute: WorkflowHandler<TInput, TOutput, TConfig>;

  /**
   * Input schema
   */
  input?: unknown;

  /**
   * Output schema
   */
  output?: unknown;

  /**
   * Action metadata
   */
  meta?: {
    /**
     * Action description
     */
    description?: string;

    /**
     * Whether action is idempotent
     */
    idempotent?: boolean;

    /**
     * Retry configuration
     */
    retry?: {
      maxAttempts?: number;
      backoffMs?: number;
    };
  };
}

/**
 * Webhook handler function signature
 */
export type WebhookHandler<TPayload = unknown, TConfig = unknown> = (
  ctx: PluginContextV3<TConfig>,
  payload: TPayload
) => Promise<void>;

/**
 * Webhook definition
 */
export interface WebhookDefinition<TPayload = unknown, TConfig = unknown> {
  /**
   * Handler function
   */
  handle: WebhookHandler<TPayload, TConfig>;

  /**
   * Payload schema
   */
  payload?: unknown;

  /**
   * Webhook metadata
   */
  meta?: {
    /**
     * Webhook description
     */
    description?: string;

    /**
     * Event type this webhook handles
     */
    event?: string;
  };
}
