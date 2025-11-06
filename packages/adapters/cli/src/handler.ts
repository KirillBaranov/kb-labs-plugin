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
} from '@kb-labs/plugin-runtime';
import type { CliContext } from '@kb-labs/cli-core';
import { execute as runtimeExecute } from '@kb-labs/plugin-runtime';
import { createId, PluginRegistry, getSuggestions, formatSuggestions, getSnapshotsDir, formatTimeline, exportProfileChromeFormat } from '@kb-labs/plugin-runtime';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import type { CliHandlerContext, AdapterMetadata } from '@kb-labs/sandbox';
import { ADAPTER_TYPES, validateAdapterMetadata, createDebugLogger, createLoggerOptionsFromContext } from '@kb-labs/sandbox';
import { CURRENT_CONTEXT_VERSION } from '@kb-labs/sandbox';

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
  
  // Also set in any for backward compatibility (remove if not needed)
  (execCtx as any).pluginRoot = pluginRoot;
  
  return execCtx;
}

/**
 * Execute command handler
 */
export async function executeCommand(
  command: CliCommandDecl,
  manifest: ManifestV2,
  cliContext: CliContext,
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
  
  // Create logger with unified options using context helper
  const loggerOptions = createLoggerOptionsFromContext({
    debug: !!debugFlag,
    debugLevel,
    debugFormat: format,
    jsonMode,
    traceId,
  });
  
  const logger = createDebugLogger(!!debugFlag, 'adapter:cli', loggerOptions);
  
  // Group related debug logs
  logger.group('executeCommand');
  logger.debug('executeCommand called', {
    pluginRoot: pluginRoot || 'undefined',
    commandId: command.id,
    handler: command.handler,
  });
  
  // Default plugin root (where manifest is located) - required
  if (!pluginRoot) {
    throw new Error('pluginRoot is required for CLI command execution');
  }
  const defaultPluginRoot = pluginRoot;
  const defaultWorkdir = workdir || defaultPluginRoot;
  const defaultOutdir = outdir || path.join(defaultWorkdir, 'out');
  
  logger.debug('Request IDs created', { requestId, traceId });
  logger.debug('Execution context', {
    defaultPluginRoot,
    defaultWorkdir,
    defaultOutdir,
  });

  const execCtx = createExecutionContext(
    command,
    manifest,
    requestId,
    defaultPluginRoot,
    defaultWorkdir,
    defaultOutdir
  );

  // Add traceId to context
  execCtx.traceId = traceId;
  
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
  
  // Create typed adapter context
  const adapterContext: CliHandlerContext = {
    type: 'cli',
    presenter: cliContext.presenter,
    cwd: defaultWorkdir,
    flags: flags as Record<string, any>,
    argv: [], // TODO: pass actual argv if available
    requestId: execCtx.requestId,
    workdir: execCtx.workdir,
    outdir: execCtx.outdir,
    pluginId: execCtx.pluginId,
    pluginVersion: execCtx.pluginVersion,
    traceId: execCtx.traceId,
    spanId: execCtx.spanId,
    parentSpanId: execCtx.parentSpanId,
    debug: execCtx.debug,
  };
  execCtx.adapterContext = adapterContext;
  
  // Set debug flags early
  // Enable debug mode based on flag or deprecated env var
  execCtx.debug = !!(debugLevel !== undefined || flags.verbose || process.env.KB_PLUGIN_DEV_MODE === 'true');
  
  // Store debug level for use in runtime (for profile, inspect modes)
  if (debugLevel) {
    execCtx.debugLevel = debugLevel;
  }

  logger.debug('Created adapterContext', {
    hasAdapterContext: !!adapterContext,
    adapterContextType: adapterContext?.type,
  });
  
  logger.debug('Debug configuration', {
    debugFlag,
    debugLevel: debugLevel || 'none',
    format,
    detailLevel: loggerOptions.detailLevel || 'verbose',
    jsonMode,
  });
  
  logger.groupEnd();

  // Show inspect mode instructions if enabled
  if (debugLevel === 'inspect') {
    cliContext.presenter.info('');
    cliContext.presenter.info('🔍 Node.js Debugger Mode');
    cliContext.presenter.info('   The process will pause at the first line of your handler');
    cliContext.presenter.info('   Connect your debugger to continue execution');
    cliContext.presenter.info('');
    cliContext.presenter.info('   Options:');
    cliContext.presenter.info('   1. Chrome DevTools: Open chrome://inspect');
    cliContext.presenter.info('   2. VS Code: Attach to process (F5)');
    cliContext.presenter.info('   3. Command line: node inspect <script>');
    cliContext.presenter.info('');
  }

  // Parse dry-run flag
  if (flags.dryRun || flags['dry-run']) {
    execCtx.dryRun = true;
  }

  // Parse save-snapshot flag
  if (flags.saveSnapshot || flags['save-snapshot']) {
    (execCtx as any).saveSnapshot = true;
  }

  // Parse mock flags (for test fixtures)
  if (flags.mock || flags['mock']) {
    (execCtx as any).mock = true;
  }
  if (flags.recordMocks || flags['record-mocks']) {
    (execCtx as any).recordMocks = true;
  }

  // Setup log callback only for debug mode with formatting
  // Without debug mode, output goes directly through stdout/stderr in subprocess
  if (execCtx.debug) {
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
  logger.group('runtimeExecute');
  let result: ExecuteResult;
  try {
    logger.debug('About to call runtimeExecute', {
      handler: `${handlerRef.file}#${handlerRef.export}`,
      pluginRoot: execCtx.pluginRoot,
      workdir: execCtx.workdir,
    });
    
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
      logger.error('Handler execution failed', {
        resultExists: !!result,
        resultOk: result?.ok,
        error: result?.error ? JSON.stringify(result.error, null, 2) : undefined,
        logLines: result?.logs?.length || 0,
        fullResult: JSON.stringify(result, null, 2),
      });
    } else {
      logger.debug('runtimeExecute completed successfully');
    }
    
    logger.groupEnd();
  } catch (error: any) {
    // Catch and re-throw with more context
    // Always log error (even without --debug) if runtimeExecute throws
    logger.error('runtimeExecute threw an error', {
      error: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace',
    });
    
    logger.groupEnd();
    
    // Re-throw to be caught by outer error handler
    throw error;
  }

  if (!result.ok) {
    // Error - send to stderr
    const error = result.error;
    
    // Build error message
    let errorMessage = `[${manifest.id}] ${error?.message || error?.code || 'Unknown error'}`;
    
    // Add error code if available and different from message
    if (error?.code && error.code !== error.message) {
      errorMessage += ` (code: ${error.code})`;
    }
    
    // Add error details if available
    if (error?.details) {
      errorMessage += `\nDetails: ${JSON.stringify(error.details, null, 2)}`;
    }
    
    // Add stack trace if available (even without --debug, show on error)
    if (error?.trace) {
      errorMessage += `\n\nStack trace:\n${error.trace}`;
    } else if ((error as any)?.stack) {
      // Fallback for non-ErrorEnvelope errors
      errorMessage += `\n\nStack trace:\n${(error as any).stack}`;
    }
    
    // Add logs from sandbox if available (always show last 50 lines on error)
    // Even without --debug, we collect logs for error display
    if (result.logs && result.logs.length > 0) {
      const logLines = result.logs.slice(-50); // Last 50 lines
      errorMessage += `\n\nSandbox logs (last ${logLines.length} lines):\n${logLines.join('\n')}`;
    } else {
      // If no logs, at least mention that logs were not collected
      errorMessage += `\n\n(No sandbox logs available. Run with --debug for more details.)`;
    }
    
    // Add error suggestions
    const suggestions = getSuggestions(error?.code || 'UNKNOWN');
    if (suggestions.length > 0) {
      errorMessage += `\n\n${formatSuggestions(suggestions)}`;
    }
    
    // Show snapshot path if available
    try {
      const snapshotsDir = getSnapshotsDir(execCtx.workdir);
      const snapshotFiles = await require('fs').promises.readdir(snapshotsDir).catch(() => []);
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
    
    cliContext.presenter.error(errorMessage);

    // Map error code to exit code
    const exitCode = mapErrorCodeToExitCode(error.code);

    return exitCode;
  }

  // Success - output result if available
  if (result.data) {
    const output = result.data as any;
    
    // Handle case when command returns { exitCode, ...artifactData }
    // Extract exitCode if present, use rest as output
    let outputData = output;
    let commandExitCode: number | undefined;
    
    if (output && typeof output === 'object' && 'exitCode' in output) {
      // Command returned object with exitCode (for artifacts)
      commandExitCode = output.exitCode as number;
      // Remove exitCode from output for display
      const { exitCode, ...rest } = output;
      outputData = Object.keys(rest).length > 0 ? rest : undefined;
    }
    
    // If we have exitCode from command, use it (but don't return early - still process artifacts)
    // Note: We'll return commandExitCode at the end if it's set
    
    // Check if output has json flag or is explicitly a JSON response
    if (outputData && (outputData.json || flags.json)) {
      cliContext.presenter.json(outputData);
    } else if (outputData && outputData.ok !== false && outputData.message) {
      // Success message
      if (!flags.quiet) {
        cliContext.presenter.info(outputData.message);
      }
    } else if (outputData && outputData.ok !== false && typeof outputData === 'object') {
      // Complex output - log key info
      if (!flags.quiet) {
        // Try to extract meaningful info
        if (outputData.mindDir) {
          cliContext.presenter.info(`✓ Mind workspace initialized: ${outputData.mindDir}`);
        } else if (outputData.packPath) {
          cliContext.presenter.info(`✓ Pack created: ${outputData.packPath}`);
        } else if (outputData.query) {
          cliContext.presenter.info(`✓ Query executed: ${outputData.query}`);
        } else {
          // Fallback: just indicate success
          cliContext.presenter.info('✓ Command completed successfully');
        }
      }
    } else if (!outputData && !flags.quiet) {
      // No output data but command succeeded - show success message
      cliContext.presenter.info(`✓ Command ${command.id} completed successfully`);
    }
    
    // Return command exit code if set (for artifacts to be processed)
    // Note: We return 0 here, actual exit code handling is done by execute.ts
    // The exitCode in result.data is used for artifact processing
  } else if (!flags.quiet) {
    // No data but command succeeded - show success message
    cliContext.presenter.info(`✓ Command ${command.id} completed successfully`);
  }

  // Show performance profile if available
  if (result.profile && debugLevel === 'profile') {
    cliContext.presenter.info('');
    cliContext.presenter.info(formatTimeline(result.profile));
    
    // Option to export to Chrome DevTools format
    if (flags['profile-export']) {
      const exportPath = typeof flags['profile-export'] === 'string' 
        ? flags['profile-export'] 
        : path.join(execCtx.workdir, '.kb', 'debug', 'tmp', 'profiles', `profile-${Date.now()}.json`);
      
      try {
        const exportDir = path.dirname(exportPath);
        await fs.mkdir(exportDir, { recursive: true });
        const chromeFormat = exportProfileChromeFormat(result.profile);
        await fs.writeFile(exportPath, JSON.stringify(chromeFormat, null, 2));
        cliContext.presenter.info(`📊 Profile exported to: ${exportPath}`);
        cliContext.presenter.info(`   Open in Chrome DevTools: chrome://tracing → Load`);
      } catch (error: any) {
        cliContext.presenter.warn(`Failed to export profile: ${error.message}`);
      }
    }
  }

  // Success - return 0
  return 0;
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
