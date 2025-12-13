/**
 * @module @kb-labs/plugin-runtime/presenter/cli-ui-facade
 * UIFacade implementation for CLI parent process using shared-cli-ui formatting.
 */

import {
  sideBorderBox,
  formatCommandResult,
  safeColors,
  safeSymbols,
  type SideBorderBoxOptions,
  type CommandResultParams,
} from '@kb-labs/shared-cli-ui';
import type {
  UIFacade,
  UIColors,
  UISymbols,
  PresenterMessageOptions,
  PresenterProgressPayload,
  ConfirmOptions,
  SideBoxOptions,
  BoxOptions,
  TableRow,
  KeyValueOptions,
} from './presenter-facade';

export interface CliUIFacadeOptions {
  /**
   * Verbosity level for output filtering
   * - quiet: Only errors
   * - normal: Success, warnings, errors
   * - verbose: All including info
   */
  verbosity?: 'quiet' | 'normal' | 'verbose';
  /**
   * Whether to output JSON instead of formatted text
   */
  jsonMode?: boolean;
}

/**
 * CLI UI facade that uses shared-cli-ui for formatting and outputs to console.
 * Used in CLI parent process context.
 */
export class CliUIFacade implements UIFacade {
  private readonly verbosity: 'quiet' | 'normal' | 'verbose';
  private readonly jsonMode: boolean;

  constructor(options: CliUIFacadeOptions = {}) {
    this.verbosity = options.verbosity ?? 'normal';
    this.jsonMode = options.jsonMode ?? false;
  }

  // ============================================================
  // PRESENTER FACADE METHODS (inherited)
  // ============================================================

  message(text: string, options?: PresenterMessageOptions): void {
    const level = options?.level ?? 'info';

    // Filter based on verbosity
    if (this.verbosity === 'quiet' && level !== 'error') {
      return;
    }
    if (this.verbosity === 'normal' && level === 'debug') {
      return;
    }

    if (this.jsonMode) {
      console.log(JSON.stringify({ type: 'message', level, text, meta: options?.meta }));
    } else {
      console.log(text);
    }
  }

  progress(update: PresenterProgressPayload): void {
    // Progress only in normal/verbose modes
    if (this.verbosity === 'quiet') {
      return;
    }

    if (this.jsonMode) {
      console.log(JSON.stringify({ type: 'progress', ...update }));
    } else {
      const statusSymbol = update.status === 'success' ? safeSymbols.success :
                           update.status === 'failed' ? safeSymbols.error :
                           safeSymbols.info;
      const message = update.message ?? update.stage;
      console.log(`${statusSymbol} ${message}`);
    }
  }

  json(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
  }

  error(error: unknown, meta?: Record<string, unknown>): void {
    // Errors always shown
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (this.jsonMode) {
      console.error(JSON.stringify({ type: 'error', error: errorMessage, meta }));
    } else {
      console.error(safeColors.error(`${safeSymbols.error} ${errorMessage}`));
    }
  }

  async confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
    // TODO: Implement interactive confirmation (readline)
    // For now, return default
    return options?.default ?? false;
  }

  // ============================================================
  // HIGH-LEVEL API (auto-format + auto-log)
  // ============================================================

  success(title: string, data?: {
    summary?: Record<string, string | number>;
    sections?: Array<{ header?: string; items: string[] }>;
    timing?: number;
  }): void {
    // Respect quiet mode (unless it's an error, success is shown)
    if (this.verbosity === 'quiet') {
      return;
    }

    if (this.jsonMode) {
      this.json({ ok: true, title, ...data });
      return;
    }

    // Convert sections format: header? -> section (required)
    const details = data?.sections?.map(s => ({
      section: s.header ?? 'Details',
      items: s.items,
    }));

    const params: CommandResultParams = {
      title,
      summary: data?.summary,
      details,
      timing: data?.timing,
      status: 'success',
    };

    const result = formatCommandResult(params);
    console.log(result.human);
  }

  showError(title: string, error: Error | string, options?: {
    suggestions?: string[];
    timing?: number;
  }): void {
    // Errors always shown
    const errorMessage = error instanceof Error ? error.message : error;

    if (this.jsonMode) {
      this.json({
        ok: false,
        title,
        error: errorMessage,
        suggestions: options?.suggestions,
        timing: options?.timing,
      });
      return;
    }

    const params: CommandResultParams = {
      title,
      errors: [errorMessage],
      details: options?.suggestions ? [{ section: 'Suggestions', items: options.suggestions }] : [],
      timing: options?.timing,
      status: 'error',
    };

    const result = formatCommandResult(params);
    console.error(result.human);
  }

  warning(title: string, warnings: string[], options?: {
    summary?: Record<string, string | number>;
    timing?: number;
  }): void {
    // Warnings shown in normal/verbose modes
    if (this.verbosity === 'quiet') {
      return;
    }

    if (this.jsonMode) {
      this.json({ title, warnings, ...options });
      return;
    }

    const params: CommandResultParams = {
      title,
      warnings,
      summary: options?.summary,
      timing: options?.timing,
      status: 'warning',
    };

    const result = formatCommandResult(params);
    console.log(result.human);
  }

  info(title: string, data?: {
    summary?: Record<string, string | number>;
    sections?: Array<{ header?: string; items: string[] }>;
  }): void {
    // Info only in verbose mode
    if (this.verbosity !== 'verbose') {
      return;
    }

    if (this.jsonMode) {
      this.json({ title, ...data });
      return;
    }

    // Convert sections format: header? -> section (required)
    const details = data?.sections?.map(s => ({
      section: s.header ?? 'Details',
      items: s.items,
    }));

    const params: CommandResultParams = {
      title,
      summary: data?.summary,
      details,
      status: 'info',
    };

    const result = formatCommandResult(params);
    console.log(result.human);
  }

  // ============================================================
  // LOW-LEVEL API (format only, returns string)
  // ============================================================

  sideBox(options: SideBoxOptions): string {
    const opts: SideBorderBoxOptions = {
      title: options.title,
      sections: options.sections,
      status: options.status,
      timing: options.timing,
    };
    return sideBorderBox(opts);
  }

  box(title: string, content?: string[], options?: BoxOptions): string {
    // Simple box using sideBox
    const sections = content ? [{ items: content }] : [];
    return sideBorderBox({ title, sections });
  }

  table(rows: TableRow[], headers?: string[]): string[] {
    // Simple table implementation
    const lines: string[] = [];

    if (headers) {
      lines.push(headers.join(' | '));
      lines.push(headers.map(() => '---').join(' | '));
    }

    for (const row of rows) {
      lines.push(row.join(' | '));
    }

    return lines;
  }

  keyValue(pairs: Record<string, string | number>, options?: KeyValueOptions): string[] {
    const entries = Object.entries(pairs);
    const maxKeyLength = options?.padKeys ? Math.max(...entries.map(([k]) => k.length)) : 0;

    return entries.map(([key, value]) => {
      const paddedKey = options?.padKeys ? key.padEnd(maxKeyLength) : key;
      const indent = options?.indent ? ' '.repeat(options.indent) : '';
      return `${indent}${paddedKey}: ${value}`;
    });
  }

  list(items: string[]): string[] {
    return items.map(item => `• ${item}`);
  }

  headline(text: string): void {
    console.log(`\n${safeColors.bold(text)}\n`);
  }

  section(header: string, content: string[]): void {
    console.log(`\n${safeColors.bold(header)}`);
    for (const line of content) {
      console.log(`  ${line}`);
    }
  }

  // ============================================================
  // STYLING UTILITIES
  // ============================================================

  readonly colors: UIColors = {
    // Semantic colors
    success: safeColors.success,
    error: safeColors.error,
    warning: safeColors.warning,
    info: safeColors.info,
    // Accent palette
    primary: safeColors.primary,
    accent: safeColors.accent,
    highlight: safeColors.accent,
    secondary: safeColors.muted,
    emphasis: safeColors.bold,
    muted: safeColors.muted,
    foreground: (s: string) => s,
    // Formatting
    dim: safeColors.muted,
    bold: safeColors.bold,
    underline: (s: string) => s, // not supported in safeColors
    inverse: (s: string) => s,   // not supported in safeColors
  };

  readonly symbols: UISymbols = {
    success: safeSymbols.success,
    error: safeSymbols.error,
    warning: safeSymbols.warning,
    info: safeSymbols.info,
    bullet: safeSymbols.bullet,
    pointer: safeSymbols.pointer,
    separator: safeSymbols.separator,
    border: safeSymbols.border,
  };

  // ============================================================
  // PROGRESS INDICATORS
  // ============================================================

  startProgress(stage: string, message: string): void {
    this.progress({
      stage,
      status: 'running',
      message,
    });
  }

  updateProgress(stage: string, message: string, percent?: number): void {
    this.progress({
      stage,
      status: 'running',
      message,
      percent,
    });
  }

  completeProgress(stage: string, message: string): void {
    this.progress({
      stage,
      status: 'success',
      message,
    });
  }

  failProgress(stage: string, message: string): void {
    this.progress({
      stage,
      status: 'failed',
      message,
    });
  }

  // ============================================================
  // OUTPUT MODES
  // ============================================================

  write(text: string): void {
    console.log(text);
  }
}
