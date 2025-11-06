/**
 * @module @kb-labs/plugin-runtime/suggestions
 * Error suggestions - smart hints for common errors
 */

/**
 * Error suggestion
 */
export interface ErrorSuggestion {
  /** Step number */
  step: number;
  /** Suggestion text */
  text: string;
  /** Optional command to run */
  command?: string;
}

/**
 * Get suggestions for error code
 */
export function getSuggestions(errorCode: string): ErrorSuggestion[] {
  const code = errorCode.toUpperCase();
  
  // MODULE_NOT_FOUND
  if (code.includes('MODULE_NOT_FOUND') || code.includes('NOT_FOUND')) {
    return [
      {
        step: 1,
        text: 'Check handler path in manifest (e.g., "./cli/init#run")',
      },
      {
        step: 2,
        text: 'Ensure the file exists and is built',
        command: 'ls -la dist/cli/init.js',
      },
      {
        step: 3,
        text: 'Rebuild the plugin',
        command: 'cd <plugin-dir> && pnpm build',
      },
      {
        step: 4,
        text: 'Run with --debug for detailed logs',
        command: 'kb <command> --debug',
      },
    ];
  }
  
  // PERMISSION_DENIED
  if (code.includes('PERMISSION') || code.includes('DENIED')) {
    return [
      {
        step: 1,
        text: 'Add required permissions to manifest.permissions',
      },
      {
        step: 2,
        text: 'Example: permissions: { fs: { mode: "read" }, net: { allowHosts: ["api.example.com"] } }',
      },
      {
        step: 3,
        text: 'Check manifest documentation for permission format',
      },
    ];
  }
  
  // TIMEOUT
  if (code.includes('TIMEOUT')) {
    return [
      {
        step: 1,
        text: 'Increase timeout in manifest.permissions.quotas.timeoutMs',
      },
      {
        step: 2,
        text: 'Example: permissions: { quotas: { timeoutMs: 120000 } }',
      },
      {
        step: 3,
        text: 'Optimize handler execution time',
      },
    ];
  }
  
  // VALIDATION_ERROR
  if (code.includes('VALIDATION') || code.includes('SCHEMA')) {
    return [
      {
        step: 1,
        text: 'Check input/output schema in manifest',
      },
      {
        step: 2,
        text: 'Run with --debug=verbose to see validation errors',
        command: 'kb <command> --debug=verbose',
      },
      {
        step: 3,
        text: 'Verify input matches expected schema',
      },
    ];
  }
  
  // CAPABILITY
  if (code.includes('CAPABILITY')) {
    return [
      {
        step: 1,
        text: 'Add required capability to manifest.capabilities',
      },
      {
        step: 2,
        text: 'Example: capabilities: ["fs:read", "net:http"]',
      },
      {
        step: 3,
        text: 'Check available capabilities in documentation',
      },
    ];
  }
  
  // QUOTA
  if (code.includes('QUOTA') || code.includes('MEMORY')) {
    return [
      {
        step: 1,
        text: 'Increase quota limits in manifest.permissions.quotas',
      },
      {
        step: 2,
        text: 'Example: permissions: { quotas: { memoryMb: 1024 } }',
      },
      {
        step: 3,
        text: 'Optimize memory usage in handler',
      },
    ];
  }
  
  // Generic error
  return [
    {
      step: 1,
      text: 'Run with --debug for detailed error information',
      command: 'kb <command> --debug',
    },
    {
      step: 2,
      text: 'Check plugin logs for more details',
    },
    {
      step: 3,
      text: 'Review manifest configuration',
    },
  ];
}

/**
 * Format suggestions for display
 */
export function formatSuggestions(suggestions: ErrorSuggestion[]): string {
  if (suggestions.length === 0) {
    return '';
  }
  
  const lines = ['💡 Suggestions:'];
  
  for (const suggestion of suggestions) {
    let line = `  ${suggestion.step}. ${suggestion.text}`;
    if (suggestion.command) {
      line += `\n     → ${suggestion.command}`;
    }
    lines.push(line);
  }
  
  return lines.join('\n');
}



