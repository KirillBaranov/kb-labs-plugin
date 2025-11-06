/**
 * @module @kb-labs/plugin-adapter-studio/registry
 * Studio registry generation from ManifestV2
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';

/**
 * Studio registry entry (widget)
 */
export interface StudioRegistryEntry {
  id: string;
  kind: 'panel' | 'card' | 'table' | 'chart' | 'custom';
  component?: string;
  data?: {
    source?: import('@kb-labs/plugin-manifest').DataSource;
    schema?: unknown;
  };
  pollingMs?: number;
  order?: number;
  layoutHint?: {
    w?: number;
    h?: number;
    minW?: number;
    minH?: number;
  };
  /** Plugin metadata */
  plugin: {
    id: string;
    version: string;
    displayName?: string;
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
      const registryKind: 'panel' | 'card' | 'table' | 'chart' | 'custom' =
        widget.kind === 'panel' || widget.kind === 'card' || widget.kind === 'table' || widget.kind === 'chart'
          ? widget.kind
          : 'custom';
      
      widgets.push({
        id: widget.id,
        kind: registryKind,
        component: widget.component,
        data: widget.data,
        pollingMs: widget.pollingMs,
        order: widget.order,
        layoutHint: widget.layoutHint,
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
      layouts.push({
        id: layout.id,
        name: layout.name || layout.id,
        template: layout.template || layout.kind || 'grid',
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
