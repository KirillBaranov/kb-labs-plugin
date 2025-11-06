/**
 * @module @kb-labs/plugin-adapter-studio/client
 * Client helpers and hooks for Studio widgets
 */

import type { StudioRegistryEntry } from './registry.js';
import { extractDataSource } from './widgets.js';

/**
 * Hook configuration for widget data
 */
export interface WidgetDataHookConfig {
  /** Widget ID */
  widgetId: string;
  /** Plugin ID */
  pluginId: string;
  /** REST route ID */
  routeId?: string;
  /** HTTP method */
  method?: 'GET' | 'POST';
  /** Headers */
  headers?: Record<string, string>;
  /** Mock fixture ID */
  fixtureId?: string;
  /** Polling interval in milliseconds (0 = no polling) */
  pollingMs: number;
  /** REST API base path */
  basePath: string;
}

/**
 * Generate useWidgetData hook code
 */
export function generateWidgetDataHook(config: WidgetDataHookConfig): string {
  const { widgetId, pluginId, routeId, method = 'GET', headers, fixtureId, pollingMs, basePath } = config;

  const hookName = `use${widgetId.replace(/[^a-zA-Z0-9]/g, '')}Data`;
  const dataSource = fixtureId ? 'mock' : 'rest';
  const routePath = routeId ? `/${routeId}` : '';

  if (dataSource === 'mock') {
    return `
import { useQuery } from '@tanstack/react-query';

export function ${hookName}(input?: unknown) {
  const queryKey = ['widget', '${pluginId}', '${widgetId}', input];
  
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await fetch('/fixtures/${fixtureId}.json');
      if (!response.ok) {
        throw new Error(\`Failed to load fixture: \${response.statusText}\`);
      }
      return response.json();
    },
    ${pollingMs > 0 ? `refetchInterval: ${pollingMs},` : ''}
  });
  
  return query;
}
`;
  }

  // REST source
  const allowedHeaders = headers ? Object.entries(headers)
    .filter(([key]) => key.toLowerCase().startsWith('x-kb-'))
    .map(([key, value]) => `'${key}': '${value}'`)
    .join(',\n          ') : '';

  return `
import { useQuery } from '@tanstack/react-query';

export function ${hookName}(input?: unknown) {
  const queryKey = ['widget', '${pluginId}', '${widgetId}', input];
  
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const url = \`\${'${basePath}'}/plugins/${pluginId}${routePath}\`;
      const options: RequestInit = {
        method: '${method}',
        headers: {
          'Content-Type': 'application/json',${allowedHeaders ? `\n          ${allowedHeaders},` : ''}
        },
      };
      
      if (input && '${method}' === 'POST') {
        options.body = JSON.stringify(input);
      } else if (input && '${method}' === 'GET') {
        const params = new URLSearchParams(input as Record<string, string>);
        const separator = url.includes('?') ? '&' : '?';
        url += separator + params.toString();
      }
      
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(error.message || \`Request failed: \${response.statusText}\`);
      }
      
      return response.json();
    },
    ${pollingMs > 0 ? `refetchInterval: ${pollingMs},` : ''}
  });
  
  return query;
}
`;
}

/**
 * Generate client hooks for all widgets in registry
 */
export function generateClientHooks(
  widgets: StudioRegistryEntry[],
  basePath: string = '/v1'
): string {
  const hooks: string[] = [];

  for (const widget of widgets) {
    const dataSource = extractDataSource(widget);
    if (dataSource.source.type === 'rest' && dataSource.routeId) {
      const hook = generateWidgetDataHook({
        widgetId: widget.id,
        pluginId: widget.plugin.id,
        routeId: dataSource.routeId,
        method: dataSource.method,
        headers: dataSource.headers,
        pollingMs: dataSource.pollingMs,
        basePath,
      });
      hooks.push(hook);
    } else if (dataSource.source.type === 'mock' && dataSource.fixtureId) {
      const hook = generateWidgetDataHook({
        widgetId: widget.id,
        pluginId: widget.plugin.id,
        fixtureId: dataSource.fixtureId,
        pollingMs: dataSource.pollingMs,
        basePath,
      });
      hooks.push(hook);
    }
  }

  return hooks.join('\n\n');
}

/**
 * Create hook factory for runtime widget data
 */
export function createUseWidgetData(
  basePath: string = '/v1'
): (widgetId: string, input?: unknown) => unknown {
  // This would be used in React components
  // For now, return a placeholder function
  return (widgetId: string, input?: unknown) => {
    // Implementation would use React Query or similar
    return {
      data: undefined,
      isLoading: false,
      error: null,
    };
  };
}
