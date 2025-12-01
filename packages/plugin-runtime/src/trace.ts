/**
 * @module @kb-labs/plugin-runtime/trace
 * Cross-plugin trace collection and visualization
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface TraceSpan {
  id: string;
  traceId: string;
  parentSpanId?: string;
  pluginId: string;
  pluginVersion?: string;
  routeOrCommand: string;
  method?: string;
  path?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'success' | 'error' | 'pending';
  error?: {
    code: string;
    message: string;
  };
  metadata?: Record<string, unknown>;
  children?: TraceSpan[];
}

export interface TraceData {
  id: string;
  traceId: string;
  rootSpanId: string;
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  spans: TraceSpan[];
  plugins: string[];
  errors: number;
  metadata?: Record<string, unknown>;
}

/**
 * Get debug directory path (.kb/debug)
 */
export function getDebugDir(repoRoot: string = process.cwd()): string {
  return path.join(repoRoot, '.kb', 'debug');
}

/**
 * Get traces directory path
 */
export function getTracesDir(repoRoot: string = process.cwd()): string {
  return path.join(getDebugDir(repoRoot), 'tmp', 'traces');
}

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}

/**
 * Save trace to disk
 */
export async function saveTrace(
  trace: TraceData,
  repoRoot: string = process.cwd()
): Promise<string> {
  const tracesDir = getTracesDir(repoRoot);
  await ensureDir(tracesDir);

  const fileName = `${trace.id}.json`;
  const filePath = path.join(tracesDir, fileName);

  await fs.writeFile(filePath, JSON.stringify(trace, null, 2));

  return filePath;
}

/**
 * Load trace from disk
 */
export async function loadTrace(
  traceId: string,
  repoRoot: string = process.cwd()
): Promise<TraceData | null> {
  const tracesDir = getTracesDir(repoRoot);
  const filePath = path.join(tracesDir, `${traceId}.json`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as TraceData;
  } catch {
    return null;
  }
}

/**
 * List all traces (newest first)
 */
export async function listTraces(
  repoRoot: string = process.cwd()
): Promise<TraceData[]> {
  const tracesDir = getTracesDir(repoRoot);

  try {
    const files = await fs.readdir(tracesDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    const traces: TraceData[] = [];
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(tracesDir, file), 'utf-8');
        const trace = JSON.parse(content) as TraceData;
        traces.push(trace);
      } catch {
        // Ignore invalid files
      }
    }

    // Sort by startTime (newest first)
    traces.sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

    return traces;
  } catch {
    return [];
  }
}

/**
 * Rotate traces (keep last N)
 */
export async function rotateTraces(
  maxCount: number = 50,
  repoRoot: string = process.cwd()
): Promise<void> {
  const traces = await listTraces(repoRoot);
  if (traces.length <= maxCount) {
    return;
  }

  // Keep newest maxCount traces
  const toKeep = traces.slice(0, maxCount);
  const toDelete = traces.slice(maxCount);

  const tracesDir = getTracesDir(repoRoot);

  for (const trace of toDelete) {
    const filePath = path.join(tracesDir, `${trace.id}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // Ignore errors
    }
  }
}

/**
 * Build span tree from flat list
 */
export function buildSpanTree(spans: TraceSpan[]): TraceSpan[] {
  const spanMap = new Map<string, TraceSpan>();
  const rootSpans: TraceSpan[] = [];

  // Create map of spans
  for (const span of spans) {
    spanMap.set(span.id, { ...span, children: [] });
  }

  // Build tree
  for (const span of spans) {
    const spanWithChildren = spanMap.get(span.id);
    if (!spanWithChildren) continue;
    
    if (span.parentSpanId) {
      const parent = spanMap.get(span.parentSpanId);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(spanWithChildren);
      } else {
        // Orphan span - add to root
        rootSpans.push(spanWithChildren);
      }
    } else {
      // Root span
      rootSpans.push(spanWithChildren);
    }
  }

  return rootSpans;
}

/**
 * Format trace as ASCII flamegraph
 */
export function formatFlamegraph(trace: TraceData): string {
  const rootSpans = buildSpanTree(trace.spans);
  let output = `Trace: ${trace.id} (total: ${trace.totalDuration || 0}ms)\n\n`;

  const renderSpan = (span: TraceSpan, indent: string = '', isLast: boolean = true): void => {
    if (!span) return;
    
    const duration = span.duration || 0;
    const totalDuration = trace.totalDuration || 1;
    const percentage = totalDuration > 0 ? (duration / totalDuration) * 100 : 0;
    const barWidth = 40;
    const barLength = Math.floor((percentage / 100) * barWidth);
    const bar = '█'.repeat(barLength) + '░'.repeat(barWidth - barLength);

    const prefix = isLast ? '└─' : '├─';
    const statusIcon = span.status === 'error' ? '✗' : span.status === 'success' ? '✓' : '⏳';
    const name = span.routeOrCommand || `${span.method} ${span.path}`;
    const pluginLabel = span.pluginId ? `[${span.pluginId}]` : '';

    output += `${indent}${prefix} ${statusIcon} ${pluginLabel} ${name} [${bar}] ${duration}ms (${percentage.toFixed(1)}%)\n`;

    if (span.children && span.children.length > 0) {
      const childIndent = indent + (isLast ? '  ' : '│ ');
      for (let i = 0; i < span.children.length; i++) {
        const child = span.children[i];
        if (child) {
          renderSpan(child, childIndent, i === span.children.length - 1);
        }
      }
    }
  };

  for (let i = 0; i < rootSpans.length; i++) {
    const span = rootSpans[i];
    if (span) {
      renderSpan(span, '', i === rootSpans.length - 1);
    }
  }

  output += `\n`;
  output += `Spans: ${trace.spans.length} | Plugins: ${trace.plugins.length} | Errors: ${trace.errors}\n`;
  output += `Details: .kb/debug/tmp/traces/${trace.id}.json\n`;

  return output;
}

/**
 * Export trace to Chrome DevTools trace format
 */
export function exportChromeFormat(trace: TraceData): object {
  // Chrome DevTools trace format: https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU/preview
  const events: Array<{
    name: string;
    ph: string;
    ts: number;
    dur?: number;
    pid: number;
    tid: number;
    cat?: string;
    args?: Record<string, unknown>;
  }> = [];

  // Convert spans to Chrome trace events
  for (const span of trace.spans) {
    const startTime = span.startTime * 1000; // Convert to microseconds
    const duration = (span.duration || 0) * 1000;
    
    // Begin event
    events.push({
      name: span.routeOrCommand || `${span.method} ${span.path}`,
      ph: 'B', // Begin
      ts: startTime,
      pid: 1,
      tid: 1,
      cat: span.pluginId,
      args: {
        pluginId: span.pluginId,
        pluginVersion: span.pluginVersion,
        ...span.metadata,
      },
    });

    // End event
    events.push({
      name: span.routeOrCommand || `${span.method} ${span.path}`,
      ph: 'E', // End
      ts: startTime + duration,
      pid: 1,
      tid: 1,
      cat: span.pluginId,
      args: {
        status: span.status,
        ...(span.error ? { error: span.error } : {}),
      },
    });
  }

  // Sort events by timestamp
  events.sort((a, b) => a.ts - b.ts);

  return {
    traceEvents: events,
    displayTimeUnit: 'ms',
    otherData: {
      traceId: trace.traceId,
      plugins: trace.plugins,
      errors: trace.errors,
    },
  };
}

