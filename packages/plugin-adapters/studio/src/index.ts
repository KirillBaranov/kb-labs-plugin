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
  type StudioHeaderHints,
} from './registry';

// Widgets
export {
  extractDataSource,
} from './widgets';

// Client
export {
  generateWidgetDataHook,
  generateClientHooks,
  createUseWidgetData,
  type WidgetDataHookConfig,
} from './client';

// Components
export {
  resolveComponent,
  loadComponent,
  loadComponentCached,
  clearComponentCache,
  type ResolvedComponent,
} from './components';
