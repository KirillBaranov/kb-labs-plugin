/**
 * @module @kb-labs/plugin-devtools/condition
 * Condition interpreter for widget visibility
 */

/**
 * Condition context
 */
export interface ConditionContext {
  ctx: {
    userId?: string;
    role?: string;
    profile?: string;
    env?: string;
  };
  metrics: Record<string, number>;
  flags: Record<string, boolean>;
}

/**
 * Parse condition expression
 * JSONLogic-like subset: AND/OR/NOT, comparisons (eq, gt, lt, in), exists
 */
export function parseCondition(condition: string): {
  valid: boolean;
  error?: string;
  ast?: unknown;
} {
  try {
    // Basic validation: check for valid function names
    const validFunctions = ['and', 'or', 'not', 'eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'exists'];
    const functionPattern = new RegExp(`\\b(${validFunctions.join('|')})\\s*\\(`, 'g');
    const matches = condition.match(functionPattern);
    
    if (!matches || matches.length === 0) {
      return {
        valid: false,
        error: 'Condition must contain at least one function call',
      };
    }

    // TODO: Implement full parser (lexer + AST builder)
    // For now, return basic validation
    return {
      valid: true,
      ast: condition,
    };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Evaluate condition expression
 * NOTE: This is a placeholder - full implementation will be added later
 */
export function evaluateCondition(
  condition: string,
  context: ConditionContext
): boolean {
  // Deny-by-default: if condition fails to parse, return false
  const parsed = parseCondition(condition);
  if (!parsed.valid) {
    return false;
  }

  // TODO: Implement full interpreter
  // For now, return false (deny-by-default)
  return false;
}

/**
 * Validate condition in manifest
 */
export function validateCondition(condition: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const parsed = parseCondition(condition);

  if (!parsed.valid) {
    errors.push(`Invalid condition: ${parsed.error || 'Unknown error'}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


