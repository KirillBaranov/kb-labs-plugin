/**
 * @module @kb-labs/plugin-adapter-studio/widgets
 * Widget data source extraction utilities
 *
 * Note: Component resolution is handled by frontend (Studio).
 * Backend only passes widget.kind and widget.component (if custom) in registry.
 * Frontend maps standard kinds to components via WIDGET_COMPONENTS map.
 */

import type { StudioRegistryEntry, StudioHeaderHints } from './registry';

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
