# @kb-labs/plugin-adapter-studio

Studio adapter for KB Labs plugins, enabling widget rendering and UI integration.

## Vision & Purpose

**@kb-labs/plugin-adapter-studio** provides Studio adapter for Plugin Model v2. It generates widget registry from manifest, provides widget type mapping, client hooks for data binding, and component resolution with dynamic imports.

### Core Goals

- **Widget Registry Generation**: Generate registry from manifest
- **Widget Type Mapping**: Map widget types to components
- **Client Hooks**: Generate React hooks for data binding
- **Component Resolution**: Dynamic component loading
- **Menu & Layout Support**: Menu and layout configuration

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Studio Adapter
    │
    ├──► Registry Generation (from manifest)
    ├──► Widget Type Mapping
    ├──► Client Hooks Generation
    ├──► Component Resolution
    └──► Menu & Layout Support
```

### Key Components

1. **Registry** (`registry.ts`): Generates widget registry from manifest
2. **Widgets** (`widgets.ts`): Widget type mapping and default components
3. **Client** (`client.ts`): React hooks generation for data binding
4. **Components** (`components.ts`): Component resolution and dynamic imports

## ✨ Features

- **Widget registry generation** from manifest
- **Widget type mapping** (panel, card, table, chart, custom)
- **Client hooks generator** for data binding
- **Component resolution** with dynamic imports
- **Menu and layout support**
- **Header hints** from manifest policies
- **Polling support** for data refresh

## 📦 API Reference

### Main Exports

#### Registry Functions

- `toRegistry(manifest)`: Generate registry from manifest
- `combineRegistries(...registries)`: Combine multiple registries

#### Widget Functions

- `getDefaultComponent(kind)`: Get default component for widget kind
- `resolveComponentPath(widget)`: Resolve component path for widget
- `extractDataSource(widget)`: Extract data source configuration

#### Client Functions

- `generateWidgetDataHook(config)`: Generate useWidgetData hook code
- `generateClientHooks(registry)`: Generate all client hooks
- `createUseWidgetData(config)`: Create useWidgetData hook

#### Component Functions

- `resolveComponent(widget)`: Resolve component for widget
- `loadComponent(componentPath, baseUrl)`: Dynamic import component
- `loadComponentCached(componentPath, baseUrl)`: Load component with caching
- `clearComponentCache()`: Clear component cache

### Types & Interfaces

#### `StudioRegistry`

```typescript
interface StudioRegistry {
  widgets: StudioRegistryEntry[];
  menus: StudioMenuEntry[];
  layouts: StudioLayoutEntry[];
  plugins: StudioPluginEntry[];
}
```

#### `StudioRegistryEntry`

```typescript
interface StudioRegistryEntry {
  id: string;
  kind: 'panel' | 'card' | 'cardlist' | 'table' | 'chart' | 'tree' | 'timeline' | 'metric' | 'logs' | 'json' | 'diff' | 'status' | 'progress' | 'infopanel' | 'keyvalue' | 'custom';
  component?: string;
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
  };
  plugin: {
    id: string;
    version: string;
    displayName?: string;
  };
}
```

#### `WidgetDataHookConfig`

```typescript
interface WidgetDataHookConfig {
  widgetId: string;
  pluginId: string;
  routeId?: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  fixtureId?: string;
  pollingMs: number;
  basePath: string;
}
```

## 🔧 Configuration

### Configuration Options

All configuration via function parameters:

- **manifest**: Plugin manifest (ManifestV2)
- **basePath**: REST API base path (default: `/v1/plugins/${pluginId}`)
- **componentPath**: Custom component path
- **pollingMs**: Polling interval in milliseconds

### Environment Variables

- None (runtime configuration only)

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/plugin-manifest` (`workspace:*`): Plugin manifest
- `@kb-labs/plugin-adapter-rest` (`workspace:*`): REST adapter (for header policies)
- `@kb-labs/api-contracts` (`workspace:*`): API contracts

### Development Dependencies

- `@kb-labs/devkit` (`workspace:*`): DevKit presets
- `@types/node` (`^24.3.3`): Node.js types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
└── (tests to be added)
```

### Test Coverage

- **Current Coverage**: ~0% (tests to be added)
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for registry generation, O(1) for component resolution
- **Space Complexity**: O(n) where n = number of widgets
- **Bottlenecks**: Registry generation for large manifests

## 🔒 Security

### Security Considerations

- **Component Loading**: Dynamic imports with path validation
- **Header Hints**: Header policy hints from manifest
- **Data Source Validation**: Data source validation

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Component Paths**: Limited component path resolution
- **Widget Types**: Fixed widget type set

### Future Improvements

- **More Widget Types**: Additional widget types
- **Better Component Resolution**: Enhanced component path resolution

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Generate Registry

```typescript
import { toRegistry } from '@kb-labs/plugin-adapter-studio';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

const registry = toRegistry(manifest);
console.log(registry.widgets);
```

### Example 2: Generate Client Hooks

```typescript
import { generateClientHooks } from '@kb-labs/plugin-adapter-studio';

const hooks = generateClientHooks(registry);
console.log(hooks);
```

### Example 3: Load Component

```typescript
import { loadComponent } from '@kb-labs/plugin-adapter-studio';

const component = await loadComponent('@/components/widgets/Card');
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
