/**
 * @module @kb-labs/plugin-adapter-studio/widgets
 * Widget type mapping and default components
 */

import type { StudioWidgetDecl } from '@kb-labs/plugin-manifest';
import type { StudioRegistryEntry, StudioHeaderHints } from './registry.js';

/**
 * Default component paths for widget kinds
 * Maps to components in apps/studio/src/components/widgets/
 */
export const DEFAULT_COMPONENTS: Record<string, string> = {
  panel: '@/components/widgets/Panel',
  card: '@/components/widgets/Card',
  table: '@/components/widgets/Table',
  chart: '@/components/widgets/Chart',
  tree: '@/components/widgets/Tree',
  timeline: '@/components/widgets/Timeline',
  metric: '@/components/widgets/Metric',
  logs: '@/components/widgets/LogViewer',
  json: '@/components/widgets/JsonViewer',
  diff: '@/components/widgets/DiffViewer',
  status: '@/components/widgets/StatusBadges',
  progress: '@/components/widgets/Progress',
};

/**
 * Map widget kind to default component
 */
export function getDefaultComponent(kind: StudioWidgetDecl['kind'] | 'custom'): string | undefined {
  if (kind === 'custom') {
    return undefined;
  }
  return DEFAULT_COMPONENTS[kind];
}

/**
 * Resolve component path for widget
 */
export function resolveComponentPath(widget: StudioRegistryEntry): string {
  // If custom component provided, use it
  if (widget.component) {
    return widget.component;
  }

  // For standard kinds, use default component
  if (widget.kind !== 'custom') {
    const defaultComponent = getDefaultComponent(widget.kind);
    if (defaultComponent) {
      return defaultComponent;
    }
  }

  // Fallback: throw error if no component found
  throw new Error(`No component path for widget ${widget.id} with kind ${widget.kind}`);
}

/**
 * Extract data source configuration
 */
export function extractDataSource(
  widget: StudioRegistryEntry
): {
  source: import('@kb-labs/plugin-manifest').DataSource;
  pollingMs: number;
  routeId?: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  fixtureId?: string;
  headerHints?: StudioHeaderHints;
} {
  if (!widget.data) {
    throw new Error(`Widget ${widget.id} has no data configuration`);
  }
  const source = widget.data.source;
  if (!source) {
    throw new Error(`Widget ${widget.id} has no data source configuration`);
  }
  const pollingMs = widget.pollingMs ?? 0;

  // Type guard for rest source
  if (source.type === 'rest') {
    const restSource: Extract<import('@kb-labs/plugin-manifest').DataSource, { type: 'rest' }> = {
      type: 'rest',
      routeId: source.routeId || '',
      method: source.method === 'GET' || source.method === 'POST' ? source.method : undefined,
      headers: source.headers,
    };
    return {
      source: restSource,
      pollingMs,
      routeId: restSource.routeId,
      method: restSource.method,
      headers: restSource.headers,
      headerHints: widget.data?.headers,
    };
  }

  // Type guard for mock source
  if (source.type === 'mock') {
    const mockSource: Extract<import('@kb-labs/plugin-manifest').DataSource, { type: 'mock' }> = {
      type: 'mock',
      fixtureId: source.fixtureId || '',
    };
    return {
      source: mockSource,
      pollingMs,
      fixtureId: mockSource.fixtureId,
      headerHints: widget.data?.headers,
    };
  }

  // Fallback: return source as-is (should not happen with proper types)
  return {
    source: source as import('@kb-labs/plugin-manifest').DataSource,
    pollingMs,
  };
}
