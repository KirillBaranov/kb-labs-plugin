/**
 * UI Facade for V3 Plugin System
 *
 * Provides a host-agnostic interface for user interaction.
 * Implementation varies by host:
 * - CLI: chalk/ora to stdout
 * - REST: Collected for response
 * - Workflow: Logged to run
 */

/**
 * Spinner interface for long-running operations
 */
export interface Spinner {
  /**
   * Update spinner message
   */
  update(message: string): void;

  /**
   * Mark as successful
   */
  succeed(message?: string): void;

  /**
   * Mark as failed
   */
  fail(message?: string): void;

  /**
   * Stop the spinner
   */
  stop(): void;
}

/**
 * Table column configuration
 */
export interface TableColumn {
  /** Column header */
  header: string;
  /** Property key in data objects */
  key: string;
  /** Column width (optional) */
  width?: number;
  /** Text alignment */
  align?: 'left' | 'center' | 'right';
}

/**
 * UI Facade interface
 *
 * All output goes through this interface so plugins don't need to know
 * which entry point they're running in.
 */
export interface UIFacade {
  /**
   * Print info message
   */
  info(message: string): void;

  /**
   * Print success message (usually green)
   */
  success(message: string): void;

  /**
   * Print warning message (usually yellow)
   */
  warn(message: string): void;

  /**
   * Print error message/object (usually red)
   */
  error(error: Error | string): void;

  /**
   * Print debug message (only shown in verbose mode)
   */
  debug(message: string): void;

  /**
   * Start a spinner/progress indicator
   *
   * Returns a Spinner that can be updated, succeeded, failed, or stopped.
   */
  spinner(message: string): Spinner;

  /**
   * Print a table of data
   *
   * @param data Array of objects to display
   * @param columns Optional column configuration
   */
  table(data: Record<string, unknown>[], columns?: TableColumn[]): void;

  /**
   * Print raw JSON (for --json mode)
   */
  json(data: unknown): void;

  /**
   * Print a newline
   */
  newline(): void;

  /**
   * Print a horizontal rule/divider
   */
  divider(): void;

  /**
   * Print a box with content
   */
  box(content: string, title?: string): void;

  /**
   * Prompt for confirmation (CLI only, others return true)
   */
  confirm(message: string): Promise<boolean>;

  /**
   * Prompt for text input (CLI only, others throw)
   */
  prompt(message: string, options?: PromptOptions): Promise<string>;
}

/**
 * Options for text prompts
 */
export interface PromptOptions {
  /** Default value */
  default?: string;
  /** Whether to mask input (for passwords) */
  mask?: boolean;
  /** Validation function */
  validate?: (value: string) => boolean | string;
}

/**
 * No-op UI implementation (for testing or silent mode)
 */
export const noopUI: UIFacade = {
  info: () => {},
  success: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  spinner: () => ({
    update: () => {},
    succeed: () => {},
    fail: () => {},
    stop: () => {},
  }),
  table: () => {},
  json: () => {},
  newline: () => {},
  divider: () => {},
  box: () => {},
  confirm: async () => true,
  prompt: async () => '',
};
