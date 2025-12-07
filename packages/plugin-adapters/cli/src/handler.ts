/**
 * @module @kb-labs/plugin-adapter-cli/handler
 * Handler binding and execution
 */

import type {
  ManifestV2,
  CliCommandDecl,
} from '@kb-labs/plugin-manifest';
import type {
  ExecutionContext,
  ExecuteResult,
  HandlerRef,
  PresenterFacade,
  PresenterMessageOptions,
  PresenterProgressPayload,
  ConfirmOptions,
} from '@kb-labs/plugin-runtime';
import type { CliContext, Presenter } from '@kb-labs/cli-contracts';
import { execute as runtimeExecute } from '@kb-labs/plugin-runtime';
import {
  createId,
  PluginRegistry,
  getSuggestions,
  formatSuggestions,
  getSnapshotsDir,
  formatTimeline,
  exportProfileChromeFormat,
  createPluginContextWithPlatform,
  OperationTracker,
} from '@kb-labs/plugin-runtime';
import {
  createEventBus,
  acquirePluginBus,
  releasePluginBus,
  DEFAULT_EVENT_BUS_CONFIG,
  type EventBus,
  type EventBusConfig,
} from '@kb-labs/plugin-runtime';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import type { CliHandlerContext, AdapterMetadata } from '@kb-labs/core-sandbox';
import { ADAPTER_TYPES, validateAdapterMetadata } from '@kb-labs/core-sandbox';
import { getLogger } from '@kb-labs/core-sys/logging';
import { CURRENT_CONTEXT_VERSION } from '@kb-labs/core-sandbox';
import { createOutput } from '@kb-labs/core-sys/output';
import type { Output } from '@kb-labs/core-sys/output';
import { loadBundle } from '@kb-labs/core-bundle';

interface CliCommandContext extends CliContext {
  presenter: Presenter;
}

class CliPresenterFacade implements PresenterFacade {
  constructor(private readonly presenter: Presenter) {}

  // UIFacade required properties (no-op implementation for CLI)
  readonly colors = {
    // Semantic colors (no-op)
    success: (s: string) => s,
    error: (s: string) => s,
    warning: (s: string) => s,
    info: (s: string) => s,
    // Accent palette (no-op)
    primary: (s: string) => s,
    accent: (s: string) => s,
    highlight: (s: string) => s,
    secondary: (s: string) => s,
    emphasis: (s: string) => s,
    muted: (s: string) => s,
    foreground: (s: string) => s,
    // Formatting (no-op)
    dim: (s: string) => s,
    bold: (s: string) => s,
    underline: (s: string) => s,
    inverse: (s: string) => s,
  };

  readonly symbols = {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
    bullet: '•',
    arrowRight: '→',
    line: '─',
    check: '✓',
    cross: '✗',
    pointer: '▸',
    ellipsis: '…',
    play: '▶',
    separator: '│',
    border: '─',
  };

  message(text: string, options?: PresenterMessageOptions): void {
    const level = options?.level ?? 'info';
    switch (level) {
      case 'debug':
        this.presenter.write?.(text) ?? this.presenter.info?.(text);
        break;
      case 'warn':
        this.presenter.warn?.(text) ?? this.presenter.write?.(text);
        break;
      case 'error':
        this.presenter.error?.(text) ?? this.presenter.write?.(text);
        break;
      default:
        this.presenter.info?.(text) ?? this.presenter.write?.(text);
        break;
    }
    if (options?.meta && Object.keys(options.meta).length > 0) {
      const serialized = safeSerialize(options.meta);
      if (serialized) {
        this.presenter.write?.(serialized);
      }
    }
  }

  progress(update: PresenterProgressPayload): void {
    const status = update.status ? `[${update.status}]` : '';
    const percent =
      typeof update.percent === 'number'
        ? ` ${update.percent.toFixed(
            Number.isInteger(update.percent) ? 0 : 1,
          )}%`
        : '';
    const message = update.message ? ` - ${update.message}` : '';
    const line = `${update.stage}${status}${percent}${message}`;
    this.presenter.info?.(line) ?? this.presenter.write?.(line);
  }

  json(data: unknown): void {
    this.presenter.json?.(data);
  }

  error(error: unknown, meta?: Record<string, unknown>): void {
    const message = resolveErrorMessage(error);
    this.presenter.error?.(message) ?? this.presenter.write?.(message);
    if (meta && Object.keys(meta).length > 0) {
      const serialized = safeSerialize(meta);
      if (serialized) {
        this.presenter.error?.(serialized);
      }
    }
  }

  async confirm(message: string, options?: ConfirmOptions): Promise<boolean> {
    // Use readline for interactive confirmation
    const readline = await import('node:readline/promises');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      // Show message
      this.presenter.write?.(message);

      const answer = await Promise.race([
        rl.question(''),
        new Promise<string>((resolve) => {
          const timeout = setTimeout(() => {
            resolve('');
          }, options?.timeoutMs || 30000);
          // Clear timeout if resolved early
          rl.once('line', () => clearTimeout(timeout));
        }),
      ]);

      rl.close();

      const normalized = answer.trim().toLowerCase();
      return normalized === 'y' || normalized === 'yes';
    } catch {
      rl.close();
      return options?.default ?? false;
    }
  }
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function safeSerialize(payload: Record<string, unknown>): string | null {
  try {
    // CRITICAL OOM FIX: Use compact JSON (no pretty-print) to avoid split('\n') memory issues
    // V8's JSON.stringify(obj, null, 2) internally calls split('\n') which causes OOM on large objects
    // Also limit payload size
    const MAX_PAYLOAD_SIZE = 10000; // 10KB max
    const str = JSON.stringify(payload); // Compact format!
    if (str.length > MAX_PAYLOAD_SIZE) {
      return `[Payload too large: ${str.length} chars, truncated]`;
    }
    return str;
  } catch {
    return null;
  }
}

/**
 * Parse handlerRef from string format (e.g., './cli/init-handler.js#run')
 */
function parseHandlerRef(handlerRef: string): HandlerRef {
  const [file, exportName] = handlerRef.split('#');
  if (!exportName || !file) {
    throw new Error(`Handler reference must include export name: ${handlerRef}`);
  }
  return { file, export: exportName };
}

/**
 * Create execution context from command declaration
 */
function createExecutionContext(
  command: CliCommandDecl,
  manifest: ManifestV2,
  requestId: string,
  pluginRoot: string,
  workdir: string,
  outdir?: string
): ExecutionContext {
  const execCtx: ExecutionContext = {
    requestId,
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    routeOrCommand: command.id,
    workdir,
    outdir: outdir || path.join(workdir, 'out'),
    pluginRoot, // Ensure pluginRoot is set properly
    debug: process.env.KB_PLUGIN_DEV_MODE === 'true',
    tmpFiles: [],
  };
  
  return execCtx;
}

function resolveEventBusConfig(manifest: ManifestV2): EventBusConfig {
  const config: EventBusConfig = { ...DEFAULT_EVENT_BUS_CONFIG };
  const permissions = manifest.permissions as { events?: Record<string, unknown> } | undefined;
  const eventsPerms = permissions?.events ?? {};

  if (typeof eventsPerms.maxPayloadBytes === 'number') {
    config.maxPayloadBytes = Math.max(1024, eventsPerms.maxPayloadBytes);
  }
  if (typeof eventsPerms.maxListenersPerTopic === 'number') {
    config.maxListenersPerTopic = Math.max(1, eventsPerms.maxListenersPerTopic);
  }
  if (typeof eventsPerms.maxQueueSize === 'number') {
    config.maxQueueSize = Math.max(1, eventsPerms.maxQueueSize);
  }
  if (typeof eventsPerms.eventsPerMinute === 'number') {
    config.eventsPerMinute = Math.max(1, eventsPerms.eventsPerMinute);
  } else if (typeof eventsPerms.perMinute === 'number') {
    config.eventsPerMinute = Math.max(1, eventsPerms.perMinute);
  } else if (typeof eventsPerms.quotaPerMinute === 'number') {
    config.eventsPerMinute = Math.max(1, eventsPerms.quotaPerMinute);
  }
  if (typeof eventsPerms.concurrentHandlers === 'number') {
    config.concurrentHandlers = Math.max(1, eventsPerms.concurrentHandlers);
  } else if (typeof eventsPerms.concurrency === 'number') {
    config.concurrentHandlers = Math.max(1, eventsPerms.concurrency);
  }
  if (typeof eventsPerms.dropPolicy === 'string') {
    config.dropPolicy = eventsPerms.dropPolicy === 'drop-new' ? 'drop-new' : 'drop-oldest';
  }
  if (typeof eventsPerms.duplicateCacheSize === 'number') {
    config.duplicateCacheSize = Math.max(16, eventsPerms.duplicateCacheSize);
  }
  if (typeof eventsPerms.duplicateTtlMs === 'number') {
    config.duplicateTtlMs = Math.max(1000, eventsPerms.duplicateTtlMs);
  }
  if (typeof eventsPerms.defaultWaitTimeoutMs === 'number') {
    config.defaultWaitTimeoutMs = Math.max(100, eventsPerms.defaultWaitTimeoutMs);
  }
  if (typeof eventsPerms.shutdownTimeoutMs === 'number') {
    config.shutdownTimeoutMs = Math.max(100, eventsPerms.shutdownTimeoutMs);
  }

  if (Array.isArray(eventsPerms.redactKeys)) {
    config.redactKeys = eventsPerms.redactKeys;
  }

  return config;
}

/**
 * Execute command handler
 */
export async function executeCommand(
  command: CliCommandDecl,
  manifest: ManifestV2,
  cliContext: CliCommandContext,
  flags: Record<string, unknown>,
  grantedCapabilities: string[],
  pluginRoot?: string,
  workdir?: string,
  outdir?: string,
  registry?: PluginRegistry
): Promise<number> {
  const debugFlag = flags.debug;
  const jsonMode = flags.json === true;
  
  // Parse debug level from flags
  let debugLevel: 'verbose' | 'inspect' | 'profile' | undefined;
  
  if (typeof debugFlag === 'string' && ['verbose', 'inspect', 'profile'].includes(debugFlag)) {
    debugLevel = debugFlag as 'verbose' | 'inspect' | 'profile';
  } else if (debugFlag === true || debugFlag) {
    // --debug without value defaults to 'verbose'
    debugLevel = 'verbose';
  }

  const requestId = createId();
  const traceId = createId(); // Generate root traceId
  
  // Determine format from flags
  const format = jsonMode ? 'ai' : (flags['debug-format'] === 'ai' ? 'ai' : 'human');
  
  // Parse verbosity level
  const verbosity = flags.quiet ? 'quiet' 
    : flags.verbose ? 'verbose'
    : debugLevel === 'inspect' ? 'inspect'
    : debugFlag ? 'debug'
    : 'normal';
  
  // Create unified Output
  const output: Output = createOutput({
    verbosity: verbosity as any,
    format: format as any,
    json: jsonMode,
    category: `plugin:${manifest.id}`,
    context: {
      plugin: manifest.id,
      command: command.id,
      trace: traceId,
    },
  });
  
  // Output теперь использует глобальный logger напрямую (через getLogger)
  // OutputSink больше не нужен для записи в файлы
  // Можно добавить опционально только если нужна обратная связь (Logging → Output UI)
  // const outputSink = createOutputSink(output);
  // addSink(outputSink);
  
  // Create logger with unified options using context helper
  // IMPORTANT: Only enable debug logging if KB_LOG_LEVEL=debug or --debug flag is set
  // This respects parent process logging configuration (KB_LOG_LEVEL from bin.ts)
  const logLevel = process.env.KB_LOG_LEVEL || 'silent';
  const shouldDebugLog = debugFlag || logLevel === 'debug';

  const logger = getLogger('cli:command').child({
    meta: {
      layer: 'cli',
      traceId,
      reqId: requestId,
      commandId: command.id,
      pluginId: manifest.id,
      debug: !!debugFlag,
      jsonMode,
      format,
    },
  });

  // Group related debug logs (only in debug mode)
  if (shouldDebugLog) {
    logger.debug('executeCommand called', {
      pluginRoot: pluginRoot || 'undefined',
      commandId: command.id,
      handler: command.handler,
    });
  }

  // Default plugin root (where manifest is located) - required
  if (!pluginRoot) {
    throw new Error('pluginRoot is required for CLI command execution');
  }
  const defaultPluginRoot = pluginRoot;
  const defaultWorkdir = workdir || defaultPluginRoot;
  const defaultOutdir = outdir || path.join(defaultWorkdir, 'out');

  const operationTracker = new OperationTracker();

  // Load product config automatically using Profiles v2
  // TODO: docs/tasks/TASK-005-ctx-config-auto-loading.md
  let productConfig: any = undefined;
  const productId = command.group; // Use command group as productId (e.g., 'mind', 'ai-review')
  const profileId = process.env.KB_PROFILE || 'default'; // From --profile flag or KB_PROFILE env var, fallback to 'default'

  if (productId) {
    try {
      const bundle = await loadBundle({
        cwd: defaultWorkdir,
        product: productId,
        profileId,
      });
      productConfig = bundle.config;

      if (shouldDebugLog) {
        logger.debug('Loaded product config', {
          productId,
          profileId: profileId ?? 'default',
          hasConfig: !!productConfig,
          configKeys: productConfig ? Object.keys(productConfig) : [],
          bundleProfileId: bundle.profile?.id,
          bundleProfileLabel: bundle.profile?.label,
        });
      }
    } catch (error) {
      // Config loading is optional - plugin can work without config
      if (shouldDebugLog) {
        logger.debug('Failed to load product config (non-fatal)', {
          productId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const pluginContext = createPluginContextWithPlatform({
    host: 'cli',
    requestId,
    pluginId: manifest.id,
    pluginVersion: manifest.version,
    tenantId: process.env.KB_TENANT_ID ?? 'default',
    ui: new CliPresenterFacade(cliContext.presenter),
    config: productConfig, // Auto-loaded config
    metadata: {
      cwd: defaultWorkdir,
      outdir: defaultOutdir,
      flags,
      jsonMode,
      getTrackedOperations: () => operationTracker.toArray(),
    },
  });

  if (shouldDebugLog) {
    logger.debug('Request IDs created', { requestId, traceId });
    logger.debug('Execution context', {
      defaultPluginRoot,
      defaultWorkdir,
      defaultOutdir,
    });
  }

  const execCtx = createExecutionContext(
    command,
    manifest,
    requestId,
    defaultPluginRoot,
    defaultWorkdir,
    defaultOutdir
  );
  execCtx.pluginContext = pluginContext;
  execCtx.operationTracker = operationTracker;

  // Add traceId to context
  execCtx.traceId = traceId;

  // Add platformConfig from global (set by CLI bootstrap)
  if ((globalThis as any).__KB_PLATFORM_CONFIG__) {
    execCtx.platformConfig = (globalThis as any).__KB_PLATFORM_CONFIG__;
  }
  
  // Set context version
  execCtx.version = CURRENT_CONTEXT_VERSION;
  
  // Create adapter metadata
  const adapterMeta: AdapterMetadata = {
    type: ADAPTER_TYPES.CLI,
    signature: 'command',
    version: '1.0.0',
    meta: {
      // Future CLI-specific metadata
    },
  };
  validateAdapterMetadata(adapterMeta);
  execCtx.adapterMeta = adapterMeta;
  
  // Create typed adapter context with Output
  const adapterContext: CliHandlerContext = {
    type: 'cli',
    output: output, // ✅ Unified Output
    presenter: cliContext.presenter, // ⚠️ Deprecated, kept for BC
    cwd: defaultWorkdir,
    flags: flags as Record<string, unknown>,
    argv: (cliContext as { argv?: string[] }).argv ?? [], // Use argv from context if available
    requestId: execCtx.requestId,
    workdir: execCtx.workdir,
    outdir: execCtx.outdir,
    pluginId: execCtx.pluginId,
    pluginVersion: execCtx.pluginVersion,
    traceId: execCtx.traceId,
    spanId: execCtx.spanId,
    parentSpanId: execCtx.parentSpanId,
    debug: execCtx.debug,
    config: productConfig, // Auto-loaded product config
    profileId, // Profile ID (Profiles v2)
    // Add logger to context (for direct use)
    logger: logger.child({
      meta: {
        plugin: manifest.id,
        command: command.id,
      },
    }),
  };
  execCtx.adapterContext = adapterContext;
  
  // Set debug flags early
  // Enable debug mode based on flag or deprecated env var
  execCtx.debug = !!(debugLevel !== undefined || flags.verbose || process.env.KB_PLUGIN_DEV_MODE === 'true');
  
  // Store debug level for use in runtime (for profile, inspect modes)
  if (debugLevel) {
    execCtx.debugLevel = debugLevel;
  }

  if (shouldDebugLog) {
    logger.debug('Created adapterContext', {
      hasAdapterContext: !!adapterContext,
      adapterContextType: adapterContext?.type,
    });

    logger.debug('Debug configuration', {
      debugFlag,
      debugLevel: debugLevel || 'none',
      format,
      jsonMode,
    });
  }

  const eventsConfig = resolveEventBusConfig(manifest);
  const permissions = manifest.permissions as { events?: { scopes?: string[] } } | undefined;
  const eventsPermissions = permissions?.events ?? {};
  const pluginScopeEnabled =
    Array.isArray(eventsPermissions.scopes) && eventsPermissions.scopes.includes('plugin');

  const busLogger = (level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) => {
    switch (level) {
      case 'error':
        logger.error(message, meta);
        break;
      case 'warn':
        logger.warn(message, meta);
        break;
      case 'info':
        logger.info?.(message, meta);
        break;
      default:
        // Only log debug messages if in debug mode
        if (shouldDebugLog) {
          logger.debug(message, meta);
        }
    }
  };

  const eventHooks = {
    analytics: async (event: string, data: Record<string, unknown>) => {
      // TODO: Re-enable analytics using pluginContext.platform.analytics.track()
      // Analytics now flows through platform abstractions
      // await emitAnalyticsEvent(event, { ... });
    },
    logger: busLogger,
  };

  const localEventBus = createEventBus({
    config: eventsConfig,
    hooks: eventHooks,
    permissions: manifest.permissions,
    contextMeta: {
      pluginId: manifest.id,
      pluginVersion: manifest.version,
      traceId,
      requestId,
      emitter: `${manifest.id}:${command.id}`,
    },
  });

  let pluginEventBus: EventBus | undefined;
  const pluginBusKey = manifest.id;
  if (pluginScopeEnabled) {
    pluginEventBus = acquirePluginBus(pluginBusKey, {
      config: eventsConfig,
      hooks: eventHooks,
      permissions: manifest.permissions,
      contextMeta: {
        pluginId: manifest.id,
        pluginVersion: manifest.version,
        emitter: manifest.id,
      },
    });
  }

  execCtx.extensions = {
    ...(execCtx.extensions ?? {}),
    events: {
      local: localEventBus,
      plugin: pluginEventBus,
      config: eventsConfig,
    },
  };

  let result: ExecuteResult;
  try {
    // Show inspect mode instructions if enabled
    if (debugLevel === 'inspect') {
    output.info('');
    output.info('🔍 Node.js Debugger Mode');
    output.info('   The process will pause at the first line of your handler');
    output.info('   Connect your debugger to continue execution');
    output.info('');
    output.info('   Options:');
    output.info('   1. Chrome DevTools: Open chrome://inspect');
    output.info('   2. VS Code: Attach to process (F5)');
    output.info('   3. Command line: node inspect <script>');
    output.info('');
    }

  // Parse dry-run flag
    if (flags.dryRun || flags['dry-run']) {
      execCtx.dryRun = true;
    }

  // Parse save-snapshot flag
    if (flags.saveSnapshot || flags['save-snapshot']) {
      (execCtx as ExecutionContext & { saveSnapshot?: boolean }).saveSnapshot = true;
    }

  // Parse mock flags (for test fixtures)
    if (flags.mock || flags['mock']) {
      (execCtx as ExecutionContext & { mock?: boolean }).mock = true;
    }
    if (flags.recordMocks || flags['record-mocks']) {
      (execCtx as ExecutionContext & { recordMocks?: boolean }).recordMocks = true;
    }

  // Setup log callback only for debug mode with formatting
  // Without debug mode, output goes directly through stdout/stderr in subprocess
    if (execCtx && execCtx.debug) {
      execCtx.onLog = (line: string, level: 'info' | 'warn' | 'error' | 'debug') => {
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      });
      
      // Color formatting (simple ANSI codes)
      const colors = {
        error: '\x1b[31m', // red
        warn: '\x1b[33m',  // yellow
        info: '\x1b[34m',  // blue
        debug: '\x1b[90m', // gray
        reset: '\x1b[0m',
      };
      
      const color = colors[level] || colors.info;
      const levelStr = level.toUpperCase().padEnd(5);
      const formattedLine = `${colors.reset}[${timestamp}] ${color}[${levelStr}]${colors.reset} ${line}`;
      
      // Output to stdout/stderr based on level
        if (level === 'error') {
          process.stderr.write(formattedLine + '\n');
        } else {
          process.stdout.write(formattedLine + '\n');
        }
      };
    }
  // Without debug mode, onLog is not needed - output goes directly through stdout/stderr

  // Parse handler reference
    const handlerRef = parseHandlerRef(command.handler);

  // Resolve permissions (merge manifest permissions with system policy)
    const perms = manifest.permissions || {};

  // Execute via runtime with registry
    try {
      if (shouldDebugLog) {
        logger.debug('About to call runtimeExecute', {
          handler: `${handlerRef.file}#${handlerRef.export}`,
          pluginRoot: execCtx.pluginRoot,
          workdir: execCtx.workdir,
        });
      }
    
      result = await runtimeExecute(
      {
        handler: handlerRef,
        input: flags,
        manifest,
        perms,
      },
      execCtx,
      registry
    );
    
    // Log result details (even without --debug if error)
    // Always log result structure if error (for debugging)
      if (!result || !result.ok) {
        const DEBUG_MODE = process.env.DEBUG_SANDBOX === '1' || process.env.NODE_ENV === 'development';

        if (DEBUG_MODE) {
          // CRITICAL OOM FIX: Avoid JSON.stringify with pretty-print on large result objects
          const errorStr = result?.error ? JSON.stringify(result.error).substring(0, 500) : undefined;
          const resultStr = JSON.stringify(result).substring(0, 1000); // Truncate to 1KB max
          logger.error('Handler execution failed', {
            resultExists: !!result,
            resultOk: result?.ok,
            error: errorStr ? `${errorStr}...` : undefined,
            logLines: result?.logs?.length || 0,
            fullResult: `${resultStr}...`,
          });
        } else {
          // Simple error message in production
          logger.error('Handler execution failed', {
            error: result?.error?.message || result?.error || 'Unknown error'
          });
        }
      } else {
        if (shouldDebugLog) {
          logger.debug('runtimeExecute completed successfully');
        }
      }
    } catch (error: unknown) {
      // Catch and re-throw with more context
      // Always log error (even without --debug) if runtimeExecute throws
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('runtimeExecute threw an error', {
        error: err.message,
        stack: err.stack || 'No stack trace',
      });
      
      // Re-throw to be caught by outer error handler
      throw error;
    }

  if (!result.ok) {
    // Error - send to stderr
    const error = result.error;
    
    // Build error message with enhanced formatting
    let errorMessage = `[ERROR] Plugin execution failed\n\n`;
    errorMessage += `Error Code: ${error?.code || 'UNKNOWN'}\n`;
    errorMessage += `Message: ${error?.message || 'Unknown error'}\n`;
    
    // Add root cause analysis if available
    if (error?.rootCause) {
      const rc = error.rootCause.rootCause;
      errorMessage += `\nRoot Cause:\n`;
      errorMessage += `  Type: ${rc.type} (confidence: ${Math.round(rc.confidence * 100)}%)\n`;
      errorMessage += `  Explanation: ${rc.explanation}\n`;
      if (rc.location.file) {
        errorMessage += `  Location: ${rc.location.file}`;
        if (rc.location.line) errorMessage += `:${rc.location.line}`;
        if (rc.location.function) errorMessage += ` in ${rc.location.function}()`;
        if (rc.location.property) errorMessage += ` (property: ${rc.location.property})`;
        errorMessage += `\n`;
      }
    }
    
    // Add context information if available
    if (error?.context) {
      const ctx = error.context;
      errorMessage += `\nContext State:\n`;
      if (ctx.location.file) {
        errorMessage += `  File: ${ctx.location.file}\n`;
        if (ctx.location.function) errorMessage += `  Function: ${ctx.location.function}\n`;
        if (ctx.location.line) errorMessage += `  Line: ${ctx.location.line}\n`;
        if (ctx.location.property) errorMessage += `  Property: ${ctx.location.property}\n`;
      }
      if (ctx.availableProperties.length > 0) {
        errorMessage += `  Available: ${ctx.availableProperties.join(', ')}\n`;
      }
      if (ctx.missingProperties.length > 0) {
        errorMessage += `  Missing: ${ctx.missingProperties.join(', ')}\n`;
      }
    }
    
    // Add error details if available
    if (error?.details && Object.keys(error.details).length > 0) {
      // CRITICAL OOM FIX: Use compact JSON and truncate
      const detailsStr = JSON.stringify(error.details).substring(0, 1000);
      errorMessage += `\nDetails:\n${detailsStr}${detailsStr.length >= 1000 ? '...' : ''}\n`;
    }
    
    // Add fixes if available
    if (error?.fixes && error.fixes.length > 0) {
      errorMessage += `\nSuggested Fixes:\n`;
      for (const fix of error.fixes) {
        const autoLabel = fix.autoApplicable ? '[AUTO]' : '[MANUAL]';
        errorMessage += `  ${autoLabel} ${fix.description}\n`;
        if (fix.code) {
          errorMessage += `    Code:\n${fix.code.split('\n').map((l) => `    ${l}`).join('\n')}\n`;
        }
      }
    }
    
    // Add suggestions (fallback to old system if new ones not available)
    if (error?.suggestions && error.suggestions.length > 0) {
      errorMessage += `\nSuggestions:\n`;
      for (const suggestion of error.suggestions) {
        errorMessage += `  • ${suggestion}\n`;
      }
    } else {
      const oldSuggestions = getSuggestions(error?.code || 'UNKNOWN');
      if (oldSuggestions.length > 0) {
        errorMessage += `\n${formatSuggestions(oldSuggestions)}`;
      }
    }
    
    // Add documentation link if available
    if (error?.documentation) {
      errorMessage += `\nDocumentation: ${error.documentation}\n`;
    }
    
    // Add stack trace if available (even without --debug, show on error)
    if (error?.trace) {
      errorMessage += `\nStack Trace:\n${error.trace}\n`;
    } else if (error && typeof error === 'object' && 'stack' in error && typeof error.stack === 'string') {
      // Fallback for non-ErrorEnvelope errors
      errorMessage += `\nStack Trace:\n${error.stack}\n`;
    }
    
    // Add logs from sandbox if available (always show last 50 lines on error)
    // Even without --debug, we collect logs for error display
    if (result.logs && result.logs.length > 0) {
      const logLines = result.logs.slice(-50); // Last 50 lines
      errorMessage += `\nSandbox Logs (last ${logLines.length} lines):\n${logLines.join('\n')}\n`;
    } else {
      // If no logs, at least mention that logs were not collected
      errorMessage += `\n(No sandbox logs available. Run with --debug for more details.)\n`;
    }
    
    // Show snapshot path if available
    try {
      const snapshotsDir = getSnapshotsDir(execCtx.workdir);
      const { readdir } = await import('fs/promises');
      const snapshotFiles = await readdir(snapshotsDir).catch(() => []);
      if (snapshotFiles.length > 0) {
        // Get latest snapshot
        const latestSnapshot = snapshotFiles
          .filter((f: string) => f.endsWith('.json'))
          .sort()
          .reverse()[0];
        if (latestSnapshot) {
          const snapshotPath = path.join(snapshotsDir, latestSnapshot);
          errorMessage += `\n\n📸 Snapshot saved: ${snapshotPath}`;
          errorMessage += `\n   Replay with: kb replay ${latestSnapshot.replace('.json', '')}`;
        }
      }
    } catch {
      // Ignore snapshot path errors
    }
    
    // Use Output for error display
    const errorObj = error instanceof Error ? error : new Error(error?.message || 'Unknown error');
    output.error(errorObj, {
      title: 'Plugin execution failed',
      code: error?.code || 'UNKNOWN',
      suggestions: error?.suggestions || getSuggestions(error?.code || 'UNKNOWN').map(s => s.text),
      docs: error?.documentation,
      context: {
        rootCause: error?.rootCause,
        context: error?.context,
        details: error?.details,
        fixes: error?.fixes,
        trace: error?.trace,
        logs: result.logs?.slice(-50),
      },
    });

    // Map error code to exit code
    const exitCode = mapErrorCodeToExitCode(error.code);

    return exitCode;
  }

  // Success - output result if available
  if (result.data) {
    const resultData = result.data as Record<string, unknown>;
    
    // Handle case when command returns { exitCode, ...artifactData }
    // Extract exitCode if present, use rest as output
    let outputData: Record<string, unknown> | undefined = resultData;
    let commandExitCode: number | undefined;
    
    if (resultData && typeof resultData === 'object' && 'exitCode' in resultData) {
      // Command returned object with exitCode (for artifacts)
      commandExitCode = resultData.exitCode as number;
      // Remove exitCode from output for display
      const { exitCode, ...rest } = resultData;
      outputData = Object.keys(rest).length > 0 ? rest : undefined;
    }
    
    // If we have exitCode from command, use it (but don't return early - still process artifacts)
    // Note: We'll return commandExitCode at the end if it's set
    
    // Check if output has json flag or is explicitly a JSON response
    if (outputData && (outputData.json || flags.json)) {
      output.json(outputData);
    } else if (outputData && outputData.ok !== false && outputData.message) {
      // Success message
      output.success(outputData.message as string, outputData);
    } else if (outputData && outputData.ok !== false && typeof outputData === 'object') {
      // Complex output - log key info
      if (!flags.quiet) {
        // Try to extract meaningful info
        if (outputData.mindDir) {
          output.success(`Mind workspace initialized: ${outputData.mindDir}`, outputData);
        } else if (outputData.packPath) {
          output.success(`Pack created: ${outputData.packPath}`, outputData);
        } else if (outputData.query) {
          output.success(`Query executed: ${outputData.query}`, outputData);
        } else {
          // Fallback: just indicate success
          output.success('Command completed successfully', outputData);
        }
      }
    } else if (!outputData && !flags.quiet) {
      // No output data but command succeeded - show success message
      output.success(`Command ${command.id} completed successfully`);
    }
    
    // Return command exit code if set (for artifacts to be processed)
    // Note: We return 0 here, actual exit code handling is done by execute.ts
    // The exitCode in result.data is used for artifact processing
  } else if (!flags.quiet) {
    // No data but command succeeded - show success message
    output.success(`Command ${command.id} completed successfully`);
  }

  // Show performance profile if available
  if (result.profile && debugLevel === 'profile') {
    output.info('');
    output.write(formatTimeline(result.profile));
    
    // Option to export to Chrome DevTools format
    if (flags['profile-export']) {
      const exportPath = typeof flags['profile-export'] === 'string' 
        ? flags['profile-export'] 
        : path.join(execCtx.workdir, '.kb', 'debug', 'tmp', 'profiles', `profile-${Date.now()}.json`);
      
      try {
        const exportDir = path.dirname(exportPath);
        await fs.mkdir(exportDir, { recursive: true });
        const chromeFormat = exportProfileChromeFormat(result.profile);
        // CRITICAL OOM FIX: Use compact JSON for large profile data
        await fs.writeFile(exportPath, JSON.stringify(chromeFormat));
        output.info(`📊 Profile exported to: ${exportPath}`);
        output.info(`   Open in Chrome DevTools: chrome://tracing → Load`);
      } catch (error: any) {
        output.warn(`Failed to export profile: ${error.message}`);
      }
    }
  }

    // Success - return 0
    return 0;
  } finally {
    await localEventBus.shutdown().catch(() => {});
    if (pluginEventBus) {
      await releasePluginBus(pluginBusKey).catch(() => {});
    }
  }
}

/**
 * Map error code to exit code
 * Policy: none = 0, major = 1, critical = 2
 */
function mapErrorCodeToExitCode(
  errorCode: string,
  policy: 'none' | 'major' | 'critical' = 'major'
): number {
  if (policy === 'none') {
    return 0;
  }

  // Critical errors (5xx, permission denied, etc.)
  if (
    errorCode.includes('PERMISSION') ||
    errorCode.includes('TIMEOUT') ||
    errorCode.includes('QUOTA') ||
    errorCode.includes('INTERNAL')
  ) {
    return policy === 'critical' ? 2 : 1;
  }

  // Major errors (4xx validation, capability missing, etc.)
  if (
    errorCode.includes('VALIDATION') ||
    errorCode.includes('CAPABILITY') ||
    errorCode.includes('NOT_FOUND')
  ) {
    return policy === 'major' || policy === 'critical' ? 1 : 0;
  }

  // Default: major = 1, critical = 2, none = 0
  return policy === 'critical' ? 2 : policy === 'major' ? 1 : 0;
}
