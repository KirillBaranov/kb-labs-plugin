/**
 * @module @kb-labs/plugin-adapter-studio/registry
 * Studio registry generation from ManifestV2
 */

import type { ManifestV2, RestRouteDecl } from '@kb-labs/plugin-manifest';
import type { DataSource } from '@kb-labs/plugin-manifest';
import { resolveHeaderPolicy } from '@kb-labs/plugin-adapter-rest/header-policy';

/**
 * Studio registry entry (widget)
 */
export interface StudioRegistryEntry {
  id: string;
  kind: 'panel' | 'card' | 'cardlist' | 'table' | 'chart' | 'tree' | 'timeline' | 'metric' | 'logs' | 'json' | 'diff' | 'status' | 'progress' | 'infopanel' | 'keyvalue' | 'form' | 'input-display' | 'custom';
  component?: string;
  title?: string;
  description?: string;
  data?: {
    source?: DataSource;
    schema?: unknown;
    headers?: StudioHeaderHints;
  };
  options?: Record<string, unknown>;
  pollingMs?: number;
  order?: number;
  layoutHint?: {
    w?: number;
    h?: number;
    minW?: number;
    minH?: number;
    height?: 'auto' | number | 'fit-content';
  };
  /** Widget actions */
  actions?: Array<{
    id: string;
    label: string;
    type?: 'button' | 'modal' | 'link' | 'dropdown';
    icon?: string;
    variant?: 'primary' | 'default' | 'danger';
    handler?: {
      type: 'rest' | 'navigate' | 'callback' | 'event' | 'modal';
      config: Record<string, unknown>;
    };
    confirm?: {
      title: string;
      description: string;
    };
    disabled?: boolean | string;
    visible?: boolean | string;
    order?: number;
  }>;
  /** Event bus configuration */
  events?: {
    emit?: string[];
    subscribe?: string[];
  };
  /** Plugin metadata */
  plugin: {
    id: string;
    version: string;
    displayName?: string;
  };
}

/**
 * Header hints derived from manifest header policies
 */
export interface StudioHeaderHints {
  required: string[];
  optional: string[];
  autoInjected: string[];
  deny: string[];
  sensitive: string[];
  patterns?: string[];
}

const SYSTEM_AUTO_HEADERS = ['traceparent', 'tracestate', 'x-request-id', 'x-trace-id', 'x-idempotency-key'];

type HeaderRuleLike = {
  match:
    | { kind: 'exact'; name: string }
    | { kind: 'prefix'; prefix: string }
    | { kind: 'regex'; pattern: string; flags?: string };
  action: 'forward' | 'strip' | 'map';
  mapTo?: string;
  required?: boolean;
  sensitive?: boolean;
};

function headerCase(name: string): string {
  return name
    .toLowerCase()
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

function normalizePathFragment(path: string | undefined): string {
  if (!path) {
    return '';
  }
  const withoutQuery = path.split('?')[0]?.trim() ?? '';
  return withoutQuery.replace(/^\/+/, '');
}

function normalizeRouteAgainstBase(routePath: string, basePath: string): string {
  const fragment = normalizePathFragment(routePath);
  if (!fragment) {
    return '';
  }
  const baseFragment = normalizePathFragment(basePath);
  if (!baseFragment) {
    return fragment;
  }
  if (fragment.startsWith(baseFragment)) {
    const remainder = fragment.slice(baseFragment.length);
    return remainder.replace(/^\/+/, '');
  }
  return fragment;
}

function findRestRoute(
  manifest: ManifestV2,
  source: Extract<DataSource, { type: 'rest' }>
): RestRouteDecl | undefined {
  if (!manifest.rest?.routes || manifest.rest.routes.length === 0) {
    return undefined;
  }

  const method = (source.method ?? 'GET').toUpperCase();
  const sourceFragment = normalizePathFragment(source.routeId);
  const basePath = manifest.rest?.basePath || `/v1/plugins/${manifest.id}`;

  for (const route of manifest.rest.routes) {
    const routeMethod = route.method?.toUpperCase() ?? 'GET';
    if (routeMethod !== method) {
      continue;
    }
    const routeFragment = normalizeRouteAgainstBase(route.path ?? '', basePath);
    if (routeFragment === sourceFragment) {
      return route;
    }
  }

  // Fallback: return first route with matching method
  return manifest.rest.routes.find((route) => (route.method?.toUpperCase() ?? 'GET') === method);
}

function extractRuleTargets(rule: HeaderRuleLike): string[] {
  if (rule.action === 'map' && rule.mapTo) {
    return [rule.mapTo.toLowerCase()];
  }
  if (rule.match.kind === 'exact') {
    return [rule.match.name.toLowerCase()];
  }
  return [];
}

function computeHeaderHints(
  manifest: ManifestV2,
  source: Extract<DataSource, { type: 'rest' }>
): StudioHeaderHints | undefined {
  const route = findRestRoute(manifest, source);
  if (!route) {
    return undefined;
  }

  const basePath = manifest.rest?.basePath || `/v1/plugins/${manifest.id}`;
  const policy = resolveHeaderPolicy(manifest, route, basePath);
  if (!policy) {
    return undefined;
  }

  const required = new Set<string>();
  const optional = new Set<string>();
  const sensitive = new Set<string>();
  const deny = new Set<string>((policy.denyList ?? []).map((name: string) => name.toLowerCase()));
  const patterns: string[] = [];

  for (const rule of policy.inbound ?? []) {
    if (rule.match.kind === 'prefix') {
      patterns.push(`${headerCase(rule.match.prefix)}*`);
    } else if (rule.match.kind === 'regex') {
      patterns.push(`/${rule.match.pattern}/${rule.match.flags ?? ''}`);
    }

    const targets = extractRuleTargets(rule);
    if (targets.length === 0) {
      continue;
    }

    if (rule.required) {
      for (const target of targets) {
        required.add(target);
      }
    } else if (rule.action !== 'strip') {
      for (const target of targets) {
        optional.add(target);
      }
    }

    if (rule.sensitive) {
      for (const target of targets) {
        sensitive.add(target);
      }
    }
  }

  for (const allow of policy.allowList ?? []) {
    optional.add(allow.toLowerCase());
  }

  return {
    required: Array.from(required).map(headerCase).sort(),
    optional: Array.from(optional).map(headerCase).sort(),
    autoInjected: SYSTEM_AUTO_HEADERS.map(headerCase),
    deny: Array.from(deny).map(headerCase).sort(),
    sensitive: Array.from(sensitive).map(headerCase).sort(),
    patterns: patterns.length > 0 ? patterns : undefined,
  };
}

/**
 * Studio menu entry
 */
export interface StudioMenuEntry {
  id: string;
  label: string;
  target: string;
  order?: number;
  plugin: {
    id: string;
    version: string;
    displayName?: string;
  };
}

/**
 * Studio layout entry
 */
export interface StudioLayoutEntry {
  id: string;
  name: string;
  template: string;
  kind?: 'grid' | 'two-pane';
  title?: string;
  description?: string;
  config?: Record<string, unknown>;
  widgets?: string[];
  actions?: Array<{
    id: string;
    label: string;
    type?: 'button' | 'modal' | 'link' | 'dropdown';
    icon?: string;
    variant?: 'primary' | 'default' | 'danger';
    handler?: {
      type: 'rest' | 'navigate' | 'callback' | 'event' | 'modal';
      config: Record<string, unknown>;
    };
    confirm?: {
      title: string;
      description: string;
    };
    disabled?: boolean | string;
    visible?: boolean | string;
    order?: number;
  }>;
  plugin: {
    id: string;
    version: string;
    displayName?: string;
  };
}

/**
 * Plugin registry entry
 */
export interface StudioPluginEntry {
  id: string;
  version: string;
  displayName?: string;
  widgets: StudioRegistryEntry[];
  menus: StudioMenuEntry[];
  layouts: StudioLayoutEntry[];
}

/**
 * Complete Studio registry
 */
export interface StudioRegistry {
  registryVersion?: string;
  generatedAt?: string;
  plugins: StudioPluginEntry[];
  widgets: StudioRegistryEntry[];
  menus: StudioMenuEntry[];
  layouts: StudioLayoutEntry[];
}

/**
 * Generate Studio registry from manifest
 */
export function toRegistry(manifest: ManifestV2): StudioRegistry {
  const widgets: StudioRegistryEntry[] = [];
  const menus: StudioMenuEntry[] = [];
  const layouts: StudioLayoutEntry[] = [];

  // Process widgets
  if (manifest.studio?.widgets) {
    for (const widget of manifest.studio.widgets) {
      // Map widget kind to registry kind
      // If widget has a component, it's custom
      // Otherwise, keep the original kind (it will be resolved in WidgetRenderer)
      const registryKind: StudioRegistryEntry['kind'] =
        widget.component
          ? 'custom' // If component is provided, it's always custom
          : widget.kind;
      
      const data: StudioRegistryEntry['data'] | undefined = widget.data
        ? {
            ...widget.data,
            source: widget.data.source ? { ...widget.data.source } : undefined,
          }
        : undefined;

      if (data?.source && data.source.type === 'rest') {
        const headerHints = computeHeaderHints(manifest, data.source);
        if (headerHints) {
          data.headers = headerHints;
        }
      }

      widgets.push({
        id: widget.id,
        kind: registryKind,
        component: widget.component,
        title: widget.title,
        description: widget.description,
        data,
        options: widget.options ? { ...widget.options } : undefined,
        pollingMs: widget.pollingMs,
        order: widget.order,
        layoutHint: widget.layoutHint,
        actions: widget.actions,
        events: widget.events,
        plugin: {
          id: manifest.id,
          version: manifest.version,
          displayName: manifest.display?.name,
        },
      });
    }
  }

  // Process menus
  if (manifest.studio?.menus) {
    for (const menu of manifest.studio.menus) {
      menus.push({
        id: menu.id,
        label: menu.label,
        target: menu.target,
        order: menu.order,
        plugin: {
          id: manifest.id,
          version: manifest.version,
          displayName: manifest.display?.name,
        },
      });
    }
  }

  // Process layouts
  if (manifest.studio?.layouts) {
    for (const layout of manifest.studio.layouts) {
      // Validate layout widgets if specified
      const layoutWidgets = layout.widgets ? [...layout.widgets] : undefined;
      if (layoutWidgets && manifest.studio.widgets) {
        const widgetIds = new Set(manifest.studio.widgets.map(w => w.id));
        const invalidWidgets = layoutWidgets.filter(id => !widgetIds.has(id));
        if (invalidWidgets.length > 0) {
          // Log warning but don't fail - let Studio handle it with better UX
          console.warn(
            `[Manifest ${manifest.id}] Layout "${layout.id}" references non-existent widgets: ${invalidWidgets.join(', ')}. ` +
            `Available widgets: ${Array.from(widgetIds).join(', ')}`
          );
        }
      }

      layouts.push({
        id: layout.id,
        name: layout.name || layout.id,
        template: layout.template || layout.kind || 'grid',
        kind: layout.kind,
        title: layout.title,
        description: layout.description,
        config: layout.config ? { ...layout.config } : undefined,
        widgets: layoutWidgets,
        actions: layout.actions,
        plugin: {
          id: manifest.id,
          version: manifest.version,
          displayName: manifest.display?.name,
        },
      });
    }
  }

  // Group widgets, menus, and layouts by plugin
  const pluginMap = new Map<string, StudioPluginEntry>();
  
  for (const widget of widgets) {
    const pluginId = widget.plugin.id;
    if (!pluginMap.has(pluginId)) {
      pluginMap.set(pluginId, {
        id: pluginId,
        version: widget.plugin.version,
        displayName: widget.plugin.displayName,
        widgets: [],
        menus: [],
        layouts: [],
      });
    }
    pluginMap.get(pluginId)!.widgets.push(widget);
  }
  
  for (const menu of menus) {
    const pluginId = menu.plugin.id;
    if (!pluginMap.has(pluginId)) {
      pluginMap.set(pluginId, {
        id: pluginId,
        version: menu.plugin.version,
        displayName: menu.plugin.displayName,
        widgets: [],
        menus: [],
        layouts: [],
      });
    }
    pluginMap.get(pluginId)!.menus.push(menu);
  }
  
  for (const layout of layouts) {
    const pluginId = layout.plugin.id;
    if (!pluginMap.has(pluginId)) {
      pluginMap.set(pluginId, {
        id: pluginId,
        version: layout.plugin.version,
        displayName: layout.plugin.displayName,
        widgets: [],
        menus: [],
        layouts: [],
      });
    }
    pluginMap.get(pluginId)!.layouts.push(layout);
  }

  return {
    plugins: Array.from(pluginMap.values()),
    widgets,
    menus,
    layouts,
  };
}

/**
 * Combine multiple registries into one
 */
export function combineRegistries(...registries: StudioRegistry[]): StudioRegistry {
  const allWidgets: StudioRegistryEntry[] = [];
  const allMenus: StudioMenuEntry[] = [];
  const allLayouts: StudioLayoutEntry[] = [];
  const pluginMap = new Map<string, StudioPluginEntry>();

  // Collect all widgets, menus, and layouts
  for (const registry of registries) {
    allWidgets.push(...registry.widgets);
    allMenus.push(...registry.menus);
    allLayouts.push(...registry.layouts);
  }

  // Sort by order
  allWidgets.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    if (a.order !== undefined) {
      return -1;
    }
    if (b.order !== undefined) {
      return 1;
    }
    return a.id.localeCompare(b.id);
  });

  allMenus.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    if (a.order !== undefined) {
      return -1;
    }
    if (b.order !== undefined) {
      return 1;
    }
    return a.id.localeCompare(b.id);
  });

  // Group widgets, menus, and layouts by plugin
  for (const widget of allWidgets) {
    const pluginId = widget.plugin.id;
    if (!pluginMap.has(pluginId)) {
      pluginMap.set(pluginId, {
        id: pluginId,
        version: widget.plugin.version,
        displayName: widget.plugin.displayName,
        widgets: [],
        menus: [],
        layouts: [],
      });
    }
    pluginMap.get(pluginId)!.widgets.push(widget);
  }
  
  for (const menu of allMenus) {
    const pluginId = menu.plugin.id;
    if (!pluginMap.has(pluginId)) {
      pluginMap.set(pluginId, {
        id: pluginId,
        version: menu.plugin.version,
        displayName: menu.plugin.displayName,
        widgets: [],
        menus: [],
        layouts: [],
      });
    }
    pluginMap.get(pluginId)!.menus.push(menu);
  }
  
  for (const layout of allLayouts) {
    const pluginId = layout.plugin.id;
    if (!pluginMap.has(pluginId)) {
      pluginMap.set(pluginId, {
        id: pluginId,
        version: layout.plugin.version,
        displayName: layout.plugin.displayName,
        widgets: [],
        menus: [],
        layouts: [],
      });
    }
    pluginMap.get(pluginId)!.layouts.push(layout);
  }

  return {
    plugins: Array.from(pluginMap.values()),
    widgets: allWidgets,
    menus: allMenus,
    layouts: allLayouts,
  };
}
