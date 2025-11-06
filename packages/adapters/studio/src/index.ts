/**
 * @module @kb-labs/plugin-adapter-studio
 * Studio adapter for Plugin Model v2
 */

// Registry
export {
  toRegistry,
  combineRegistries,
  type StudioRegistry,
  type StudioRegistryEntry,
  type StudioMenuEntry,
  type StudioLayoutEntry,
  type StudioPluginEntry,
} from './registry.js';

// Widgets
export {
  getDefaultComponent,
  resolveComponentPath,
  extractDataSource,
  DEFAULT_COMPONENTS,
} from './widgets.js';

// Client
export {
  generateWidgetDataHook,
  generateClientHooks,
  createUseWidgetData,
  type WidgetDataHookConfig,
} from './client.js';

// Components
export {
  resolveComponent,
  loadComponent,
  loadComponentCached,
  clearComponentCache,
  type ResolvedComponent,
} from './components.js';
