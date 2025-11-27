/**
 * @module @kb-labs/plugin-runtime/context/context-validator
 * Context validation framework with declarative rules and auto-fixes
 */

import type { ExecutionContext } from '../types.js';

/**
 * Context validation rule
 */
export interface ContextValidationRule {
  /** Field name to validate */
  field: string;
  /** Whether field is required */
  required: boolean;
  /** Expected type (e.g., 'string', 'number', 'boolean', 'object', 'function') */
  type: string;
  /** Custom validator function */
  validator?: (value: unknown) => boolean;
  /** Default value if missing and not required */
  defaultValue?: unknown;
  /** Documentation URL or description */
  documentation?: string;
  /** Whether field is deprecated */
  deprecated?: boolean;
  /** Deprecation message */
  deprecationMessage?: string;
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  rule: string;
  message: string;
  suggestion: string;
  actualValue?: unknown;
  expectedType?: string;
}

/**
 * Validation warning details
 */
export interface ValidationWarning {
  field: string;
  message: string;
  deprecationMessage?: string;
}

/**
 * Auto-fix suggestion
 */
export interface ValidationFix {
  field: string;
  action: 'set' | 'remove' | 'convert';
  value?: unknown;
  autoApplicable: boolean;
  description: string;
}

/**
 * Context validation result
 */
export interface ContextValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  fixes: ValidationFix[];
}

/**
 * Standard validation rules for ExecutionContext
 */
export const STANDARD_CONTEXT_RULES: ContextValidationRule[] = [
  {
    field: 'requestId',
    required: true,
    type: 'string',
    documentation: 'https://kb-labs.dev/docs/execution-context#requestid',
  },
  {
    field: 'pluginId',
    required: true,
    type: 'string',
    documentation: 'https://kb-labs.dev/docs/execution-context#pluginid',
  },
  {
    field: 'pluginVersion',
    required: true,
    type: 'string',
    documentation: 'https://kb-labs.dev/docs/execution-context#pluginversion',
  },
  {
    field: 'routeOrCommand',
    required: true,
    type: 'string',
    documentation: 'https://kb-labs.dev/docs/execution-context#routeorcommand',
  },
  {
    field: 'workdir',
    required: true,
    type: 'string',
    validator: (value) => typeof value === 'string' && value.length > 0,
    documentation: 'https://kb-labs.dev/docs/execution-context#workdir',
  },
  {
    field: 'pluginRoot',
    required: true,
    type: 'string',
    validator: (value) => typeof value === 'string' && value.length > 0,
    documentation: 'https://kb-labs.dev/docs/execution-context#pluginroot',
  },
  {
    field: 'debug',
    required: false,
    type: 'boolean',
    defaultValue: false,
  },
  {
    field: 'debugLevel',
    required: false,
    type: 'string',
    validator: (value) =>
      value === undefined || ['verbose', 'inspect', 'profile'].includes(value as string),
  },
  {
    field: 'jsonMode',
    required: false,
    type: 'boolean',
    defaultValue: false,
  },
  {
    field: 'traceId',
    required: false,
    type: 'string',
  },
  {
    field: 'spanId',
    required: false,
    type: 'string',
  },
  {
    field: 'dryRun',
    required: false,
    type: 'boolean',
    defaultValue: false,
  },
];

/**
 * Get type name for a value
 */
function getTypeName(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Check if value matches expected type
 */
function matchesType(value: unknown, expectedType: string): boolean {
  const actualType = getTypeName(value);
  
  if (expectedType === 'null') return value === null;
  if (expectedType === 'undefined') return value === undefined;
  if (expectedType === 'array') return Array.isArray(value);
  if (expectedType === 'object') return typeof value === 'object' && value !== null && !Array.isArray(value);
  if (expectedType === 'function') return typeof value === 'function';
  
  return actualType === expectedType;
}

/**
 * Validate execution context against rules
 */
export function validateExecutionContext(
  ctx: ExecutionContext | undefined,
  rules: ContextValidationRule[] = STANDARD_CONTEXT_RULES
): ContextValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const fixes: ValidationFix[] = [];

  // Handle undefined context
  if (!ctx) {
    errors.push({
      field: 'context',
      rule: 'required',
      message: 'ExecutionContext is undefined',
      suggestion: 'Ensure context is created before validation. Check if context builder is called correctly.',
      expectedType: 'object',
    });
    return { valid: false, errors, warnings, fixes };
  }

  // Validate each rule
  for (const rule of rules) {
    const value = (ctx as unknown as Record<string, unknown>)[rule.field];
    const exists = value !== undefined;

    // Check required fields
    if (rule.required && !exists) {
      errors.push({
        field: rule.field,
        rule: 'required',
        message: `Required field '${rule.field}' is missing`,
        suggestion: rule.documentation
          ? `See documentation: ${rule.documentation}`
          : `Ensure '${rule.field}' is set in ExecutionContext`,
        expectedType: rule.type,
      });

      // Suggest auto-fix if default value available
      if (rule.defaultValue !== undefined) {
        fixes.push({
          field: rule.field,
          action: 'set',
          value: rule.defaultValue,
          autoApplicable: true,
          description: `Set '${rule.field}' to default value: ${JSON.stringify(rule.defaultValue)}`,
        });
      }
      continue;
    }

    // Skip validation if field doesn't exist and not required
    if (!exists) {
      continue;
    }

    // Check deprecated fields
    if (rule.deprecated) {
      warnings.push({
        field: rule.field,
        message: `Field '${rule.field}' is deprecated`,
        deprecationMessage: rule.deprecationMessage || 'This field will be removed in a future version',
      });
    }

    // Check type
    if (!matchesType(value, rule.type)) {
      errors.push({
        field: rule.field,
        rule: 'type',
        message: `Field '${rule.field}' has incorrect type. Expected '${rule.type}', got '${getTypeName(value)}'`,
        suggestion: `Ensure '${rule.field}' is of type '${rule.type}'`,
        actualValue: value,
        expectedType: rule.type,
      });

      // Suggest type conversion if possible
      if (rule.type === 'string' && (typeof value === 'number' || typeof value === 'boolean')) {
        fixes.push({
          field: rule.field,
          action: 'convert',
          value: String(value),
          autoApplicable: true,
          description: `Convert '${rule.field}' to string: ${String(value)}`,
        });
      } else if (rule.type === 'boolean' && typeof value === 'string') {
        const boolValue = value === 'true' || value === '1';
        fixes.push({
          field: rule.field,
          action: 'convert',
          value: boolValue,
          autoApplicable: true,
          description: `Convert '${rule.field}' to boolean: ${boolValue}`,
        });
      }
      continue;
    }

    // Run custom validator if provided
    if (rule.validator && !rule.validator(value)) {
      errors.push({
        field: rule.field,
        rule: 'validator',
        message: `Field '${rule.field}' failed custom validation`,
        suggestion: rule.documentation
          ? `See documentation: ${rule.documentation}`
          : `Check that '${rule.field}' meets validation requirements`,
        actualValue: value,
        expectedType: rule.type,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    fixes,
  };
}

/**
 * Apply auto-fixes to context
 */
export function applyFixes(
  ctx: ExecutionContext,
  fixes: ValidationFix[]
): ExecutionContext {
  const fixedCtx = { ...ctx };
  const ctxRecord = fixedCtx as unknown as Record<string, unknown>;

  for (const fix of fixes) {
    if (!fix.autoApplicable) continue;

    switch (fix.action) {
      case 'set':
        ctxRecord[fix.field] = fix.value;
        break;
      case 'remove':
        delete ctxRecord[fix.field];
        break;
      case 'convert':
        ctxRecord[fix.field] = fix.value;
        break;
    }
  }

  return fixedCtx;
}

/**
 * Format validation result as human-readable message
 */
export function formatValidationResult(result: ContextValidationResult): string {
  const lines: string[] = [];

  if (result.valid) {
    lines.push('✓ Context validation passed');
  } else {
    lines.push('✗ Context validation failed');
  }

  if (result.errors.length > 0) {
    lines.push(`\nErrors (${result.errors.length}):`);
    for (const error of result.errors) {
      lines.push(`  • ${error.field}: ${error.message}`);
      lines.push(`    Suggestion: ${error.suggestion}`);
      if (error.actualValue !== undefined) {
        lines.push(`    Actual value: ${JSON.stringify(error.actualValue)}`);
      }
      if (error.expectedType) {
        lines.push(`    Expected type: ${error.expectedType}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    lines.push(`\nWarnings (${result.warnings.length}):`);
    for (const warning of result.warnings) {
      lines.push(`  ⚠ ${warning.field}: ${warning.message}`);
      if (warning.deprecationMessage) {
        lines.push(`    ${warning.deprecationMessage}`);
      }
    }
  }

  if (result.fixes.length > 0) {
    lines.push(`\nAuto-fixes available (${result.fixes.length}):`);
    for (const fix of result.fixes) {
      const autoLabel = fix.autoApplicable ? '[AUTO]' : '[MANUAL]';
      lines.push(`  ${autoLabel} ${fix.field}: ${fix.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Validate and optionally fix context
 */
export function validateAndFix(
  ctx: ExecutionContext | undefined,
  rules: ContextValidationRule[] = STANDARD_CONTEXT_RULES,
  autoApply: boolean = false
): { ctx: ExecutionContext; result: ContextValidationResult } {
  const result = validateExecutionContext(ctx, rules);

  if (!ctx) {
    throw new Error('Cannot fix undefined context');
  }

  let fixedCtx = ctx;

  if (!result.valid && autoApply) {
    const applicableFixes = result.fixes.filter((f) => f.autoApplicable);
    if (applicableFixes.length > 0) {
      fixedCtx = applyFixes(ctx, applicableFixes);
      // Re-validate after fixes
      const revalidation = validateExecutionContext(fixedCtx, rules);
      return { ctx: fixedCtx, result: revalidation };
    }
  }

  return { ctx: fixedCtx, result };
}

