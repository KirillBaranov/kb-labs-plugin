/**
 * @module @kb-labs/plugin-runtime/errors/root-cause
 * Root cause analysis for errors with history integration
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getSnapshotsDir } from '../snapshot';
import type { SnapshotData } from '../snapshot';

/**
 * Root cause type
 */
export type RootCauseType =
  | 'undefined_property'
  | 'missing_dependency'
  | 'timeout'
  | 'permission_denied'
  | 'network_error'
  | 'validation_error'
  | 'type_error'
  | 'unknown';

/**
 * Root cause analysis
 */
export interface RootCauseAnalysis {
  rootCause: {
    type: RootCauseType;
    confidence: number; // 0-1
    location: {
      file?: string;
      function?: string;
      line?: number;
      property?: string;
    };
    explanation: string; // Human-readable explanation
    aiExplanation: string; // Detailed explanation for AI
  };
  relatedErrors: Array<{
    timestamp: number;
    message: string;
    similarity: number;
  }>;
  suggestedFixes: Array<{
    description: string;
    code?: string; // Code snippet for fix
    confidence: number;
    autoApplicable: boolean;
  }>;
  similarPastIssues: Array<{
    timestamp: string;
    resolved: boolean;
    solution?: string;
  }>;
}

/**
 * Load error history from snapshots
 */
async function loadErrorHistory(
  workdir: string,
  pluginId?: string,
  limit: number = 50
): Promise<SnapshotData[]> {
  try {
    const snapshotsDir = getSnapshotsDir(workdir);
    const files = await fs.readdir(snapshotsDir).catch(() => []);
    
    const snapshotFiles = files
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    const snapshots: SnapshotData[] = [];
    for (const file of snapshotFiles) {
      try {
        const content = await fs.readFile(path.join(snapshotsDir, file), 'utf-8');
        const snapshot = JSON.parse(content) as SnapshotData;
        // Filter by plugin if specified
        if (!pluginId || snapshot.pluginId === pluginId) {
          if (snapshot.result === 'error' && snapshot.error) {
            snapshots.push(snapshot);
          }
        }
      } catch {
        // Skip invalid snapshots
      }
    }

    return snapshots;
  } catch {
    return [];
  }
}

/**
 * Calculate similarity between two error messages
 * CRITICAL OOM FIX: Truncate messages to avoid split() memory issues on huge error messages
 */
function calculateSimilarity(msg1: string, msg2: string): number {
  // Truncate to first 10KB to avoid OOM on huge error messages
  const MAX_MSG_LENGTH = 10000;
  const truncated1 = msg1.length > MAX_MSG_LENGTH ? msg1.substring(0, MAX_MSG_LENGTH) : msg1;
  const truncated2 = msg2.length > MAX_MSG_LENGTH ? msg2.substring(0, MAX_MSG_LENGTH) : msg2;

  const words1 = new Set(truncated1.toLowerCase().split(/\s+/));
  const words2 = new Set(truncated2.toLowerCase().split(/\s+/));

  const intersection = new Set([...words1].filter((x) => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Find related errors from history
 */
function findRelatedErrors(
  currentMessage: string,
  history: SnapshotData[],
  threshold: number = 0.3
): RootCauseAnalysis['relatedErrors'] {
  const related: RootCauseAnalysis['relatedErrors'] = [];

  for (const snapshot of history) {
    if (!snapshot.error) continue;

    const similarity = calculateSimilarity(currentMessage, snapshot.error.message);
    if (similarity >= threshold) {
      related.push({
        timestamp: new Date(snapshot.timestamp).getTime(),
        message: snapshot.error.message,
        similarity,
      });
    }
  }

  // Sort by similarity descending
  return related.sort((a, b) => b.similarity - a.similarity).slice(0, 10);
}

/**
 * Find similar past issues
 */
function findSimilarPastIssues(
  currentMessage: string,
  currentType: RootCauseType,
  history: SnapshotData[]
): RootCauseAnalysis['similarPastIssues'] {
  const issues: RootCauseAnalysis['similarPastIssues'] = [];

  for (const snapshot of history) {
    if (!snapshot.error) continue;

    // Check if error type matches (by analyzing message)
    const snapshotType = determineRootCauseType(snapshot.error.message, snapshot.error.stack);
    if (snapshotType !== currentType) continue;

    const similarity = calculateSimilarity(currentMessage, snapshot.error.message);
    if (similarity >= 0.4) {
      issues.push({
        timestamp: snapshot.timestamp,
        resolved: snapshot.result === 'success', // If we have a success snapshot after, it's resolved
        solution: snapshot.error.details?.solution as string | undefined,
      });
    }
  }

  return issues.slice(0, 5);
}

/**
 * Analyze error to determine root cause
 */
export async function analyzeRootCause(
  error: Error | unknown,
  ctx?: Record<string, unknown>,
  stackTrace?: string,
  workdir?: string,
  pluginId?: string
): Promise<RootCauseAnalysis> {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : stackTrace;

  // Extract location from stack trace
  const location = extractLocationFromStack(errorStack);

  // Determine root cause type
  const rootCauseType = determineRootCauseType(errorMessage, errorStack);

  // Generate explanation
  const explanation = generateExplanation(rootCauseType, errorMessage, location);
  const aiExplanation = generateAIExplanation(rootCauseType, errorMessage, location, ctx);

  // Generate suggested fixes
  const suggestedFixes = generateSuggestedFixes(rootCauseType, errorMessage, location);

  // Load error history if workdir is provided
  let relatedErrors: RootCauseAnalysis['relatedErrors'] = [];
  let similarPastIssues: RootCauseAnalysis['similarPastIssues'] = [];

  if (workdir) {
    try {
      const history = await loadErrorHistory(workdir, pluginId);
      relatedErrors = findRelatedErrors(errorMessage, history);
      similarPastIssues = findSimilarPastIssues(errorMessage, rootCauseType, history);
    } catch {
      // Ignore history loading errors
    }
  }

  return {
    rootCause: {
      type: rootCauseType,
      confidence: calculateConfidence(rootCauseType, errorMessage, location),
      location,
      explanation,
      aiExplanation,
    },
    relatedErrors,
    suggestedFixes,
    similarPastIssues,
  };
}

/**
 * Synchronous version (without history)
 */
export function analyzeRootCauseSync(
  error: Error | unknown,
  ctx?: Record<string, unknown>,
  stackTrace?: string
): RootCauseAnalysis {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : stackTrace;

  const location = extractLocationFromStack(errorStack);
  const rootCauseType = determineRootCauseType(errorMessage, errorStack);
  const explanation = generateExplanation(rootCauseType, errorMessage, location);
  const aiExplanation = generateAIExplanation(rootCauseType, errorMessage, location, ctx);
  const suggestedFixes = generateSuggestedFixes(rootCauseType, errorMessage, location);

  return {
    rootCause: {
      type: rootCauseType,
      confidence: calculateConfidence(rootCauseType, errorMessage, location),
      location,
      explanation,
      aiExplanation,
    },
    relatedErrors: [],
    suggestedFixes,
    similarPastIssues: [],
  };
}

/**
 * Extract location from stack trace
 */
function extractLocationFromStack(stack?: string): RootCauseAnalysis['rootCause']['location'] {
  if (!stack) {
    return {};
  }

  // Match patterns like: "at functionName (file.ts:123:45)"
  const match = stack.match(/at\s+(\w+)\s+\(([^:]+):(\d+):(\d+)\)/);
  if (match && match[1] && match[2] && match[3]) {
    return {
      function: match[1],
      file: match[2],
      line: parseInt(match[3], 10),
    };
  }

  // Match patterns like: "file.ts:123:45"
  const fileMatch = stack.match(/([^:]+):(\d+):(\d+)/);
  if (fileMatch && fileMatch[1] && fileMatch[2]) {
    return {
      file: fileMatch[1],
      line: parseInt(fileMatch[2], 10),
    };
  }

  return {};
}

/**
 * Determine root cause type from error message and stack
 */
function determineRootCauseType(
  message: string,
  stack?: string
): RootCauseType {
  const lowerMessage = message.toLowerCase();
  const lowerStack = stack?.toLowerCase() || '';

  // Check for undefined property
  if (
    lowerMessage.includes('cannot read') ||
    lowerMessage.includes('undefined') ||
    lowerMessage.includes('null') ||
    lowerStack.includes('undefined')
  ) {
    return 'undefined_property';
  }

  // Check for timeout
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'timeout';
  }

  // Check for permission denied
  if (
    lowerMessage.includes('permission') ||
    lowerMessage.includes('denied') ||
    lowerMessage.includes('eacces') ||
    lowerMessage.includes('eperm')
  ) {
    return 'permission_denied';
  }

  // Check for network error
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('enotfound') ||
    lowerMessage.includes('fetch failed')
  ) {
    return 'network_error';
  }

  // Check for missing dependency
  if (
    lowerMessage.includes('cannot find module') ||
    lowerMessage.includes('module not found') ||
    lowerMessage.includes('require is not defined')
  ) {
    return 'missing_dependency';
  }

  // Check for validation error
  if (
    lowerMessage.includes('validation') ||
    lowerMessage.includes('invalid') ||
    lowerMessage.includes('schema')
  ) {
    return 'validation_error';
  }

  // Check for type error
  if (
    lowerMessage.includes('type') ||
    lowerMessage.includes('is not a function') ||
    lowerMessage.includes('is not defined')
  ) {
    return 'type_error';
  }

  return 'unknown';
}

/**
 * Generate human-readable explanation
 */
function generateExplanation(
  type: RootCauseType,
  message: string,
  location: RootCauseAnalysis['rootCause']['location']
): string {
  switch (type) {
    case 'undefined_property':
      return `Attempted to access a property that is undefined. This usually happens when a required value was not initialized or passed correctly.`;
    case 'missing_dependency':
      return `A required module or dependency is missing. This could be due to incomplete installation or incorrect import path.`;
    case 'timeout':
      return `Operation exceeded the maximum allowed time. This could indicate a slow operation or a deadlock.`;
    case 'permission_denied':
      return `Access was denied due to insufficient permissions. Check file system permissions or plugin manifest permissions.`;
    case 'network_error':
      return `Network operation failed. This could be due to connectivity issues, firewall restrictions, or incorrect host configuration.`;
    case 'validation_error':
      return `Input validation failed. The provided data does not match the expected schema or format.`;
    case 'type_error':
      return `Type mismatch detected. A value has an unexpected type or a function was called incorrectly.`;
    default:
      return `An unexpected error occurred: ${message}`;
  }
}

/**
 * Generate detailed AI explanation
 */
function generateAIExplanation(
  type: RootCauseType,
  message: string,
  location: RootCauseAnalysis['rootCause']['location'],
  ctx?: Record<string, unknown>
): string {
  const locationStr = location.file
    ? `${location.file}${location.line ? `:${location.line}` : ''}${location.function ? ` in ${location.function}()` : ''}`
    : 'unknown location';

  const contextStr = ctx
    ? `\n\nContext at error:\n${JSON.stringify(ctx, null, 2)}`
    : '';

  return `Root cause: ${type}\n\nError occurred at: ${locationStr}\n\n${generateExplanation(type, message, location)}${contextStr}`;
}

/**
 * Generate suggested fixes
 */
function generateSuggestedFixes(
  type: RootCauseType,
  message: string,
  location: RootCauseAnalysis['rootCause']['location']
): RootCauseAnalysis['suggestedFixes'] {
  const fixes: RootCauseAnalysis['suggestedFixes'] = [];

  switch (type) {
    case 'undefined_property':
      if (location.property) {
        fixes.push({
          description: `Check if '${location.property}' is initialized before use`,
          code: `if (!ctx.${location.property}) {\n  throw new Error('${location.property} is required');\n}`,
          confidence: 0.8,
          autoApplicable: false,
        });
      }
      fixes.push({
        description: 'Add null/undefined check before accessing property',
        code: `if (value !== undefined && value !== null) {\n  // Access property\n}`,
        confidence: 0.7,
        autoApplicable: false,
      });
      break;

    case 'missing_dependency':
      fixes.push({
        description: 'Install missing dependency',
        code: `pnpm add <missing-package>`,
        confidence: 0.9,
        autoApplicable: false,
      });
      fixes.push({
        description: 'Check import path and ensure it matches package.json exports',
        confidence: 0.7,
        autoApplicable: false,
      });
      break;

    case 'timeout':
      fixes.push({
        description: 'Increase timeout in manifest quotas',
        code: `quotas: {\n  timeoutMs: 60000 // Increase from default\n}`,
        confidence: 0.6,
        autoApplicable: false,
      });
      fixes.push({
        description: 'Optimize slow operation or add progress indicators',
        confidence: 0.5,
        autoApplicable: false,
      });
      break;

    case 'permission_denied':
      fixes.push({
        description: 'Add required permission to manifest',
        code: `permissions: {\n  fs: {\n    allow: ['<required-path>']\n  }\n}`,
        confidence: 0.9,
        autoApplicable: false,
      });
      break;

    case 'network_error':
      fixes.push({
        description: 'Check network configuration and firewall settings',
        confidence: 0.6,
        autoApplicable: false,
      });
      fixes.push({
        description: 'Verify host is in manifest net.allowHosts',
        code: `permissions: {\n  net: {\n    allowHosts: ['<host>']\n  }\n}`,
        confidence: 0.8,
        autoApplicable: false,
      });
      break;

    case 'validation_error':
      fixes.push({
        description: 'Validate input before processing',
        code: `if (!schema.validate(input)) {\n  throw new Error('Invalid input');\n}`,
        confidence: 0.8,
        autoApplicable: false,
      });
      break;

    case 'type_error':
      fixes.push({
        description: 'Add type checking before function calls',
        code: `if (typeof fn === 'function') {\n  fn();\n}`,
        confidence: 0.7,
        autoApplicable: false,
      });
      break;
  }

  return fixes;
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  type: RootCauseType,
  message: string,
  location: RootCauseAnalysis['rootCause']['location']
): number {
  let confidence = 0.5; // Base confidence

  // Increase confidence if we have location info
  if (location.file) confidence += 0.2;
  if (location.function) confidence += 0.1;
  if (location.line) confidence += 0.1;
  if (location.property) confidence += 0.1;

  // Increase confidence for specific error types
  if (type === 'permission_denied' || type === 'missing_dependency') {
    confidence += 0.1;
  }

  return Math.min(1.0, confidence);
}

