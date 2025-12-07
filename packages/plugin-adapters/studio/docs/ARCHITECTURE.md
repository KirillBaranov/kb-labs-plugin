# Package Architecture Description: @kb-labs/plugin-adapter-studio

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/plugin-adapter-studio** provides Studio adapter for KB Labs plugins. It generates widget registry from manifest, provides widget type mapping, client hooks for data binding, and component resolution with dynamic imports.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide Studio adapter for plugin widgets.

**Scope Boundaries**:
- **In Scope**: Registry generation, widget mapping, client hooks, component resolution
- **Out of Scope**: Widget rendering (in Studio app), data fetching (in client)

**Domain**: Plugin System / Studio Adapter

### 1.2 Key Responsibilities

1. **Registry Generation**: Generate widget registry from manifest
2. **Widget Mapping**: Map widget types to components
3. **Client Hooks**: Generate React hooks for data binding
4. **Component Resolution**: Dynamic component loading

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
Studio Adapter
    │
    ├──► Registry Generation (registry.ts)
    │   ├──► Parse manifest widgets
    │   ├──► Extract header hints
    │   ├──► Generate registry entries
    │   └──► Combine registries
    │
    ├──► Widget Mapping (widgets.ts)
    │   ├──► Map widget kinds to components
    │   ├──► Resolve component paths
    │   └──► Extract data sources
    │
    ├──► Client Hooks (client.ts)
    │   ├──► Generate useWidgetData hooks
    │   ├──► Generate React Query hooks
    │   └──► Create hook factories
    │
    └──► Component Resolution (components.ts)
        ├──► Resolve component paths
        ├──► Dynamic imports
        └──► Component caching
```

### 2.2 Architectural Style

- **Style**: Adapter Pattern
- **Rationale**: Adapt plugin manifests to Studio framework

## 3. Component Architecture

### 3.1 Component: Registry Generation

- **Purpose**: Generate widget registry
- **Responsibilities**: Parse manifest, extract widgets, generate registry
- **Dependencies**: plugin-manifest, plugin-adapter-rest

### 3.2 Component: Widget Mapping

- **Purpose**: Map widget types
- **Responsibilities**: Map kinds to components, resolve paths
- **Dependencies**: plugin-manifest

### 3.3 Component: Client Hooks

- **Purpose**: Generate client hooks
- **Responsibilities**: Generate React hooks, create hook factories
- **Dependencies**: None (code generation)

### 3.4 Component: Component Resolution

- **Purpose**: Resolve components
- **Responsibilities**: Resolve paths, dynamic imports, caching
- **Dependencies**: None

## 4. Data Flow

```
toRegistry(manifest)
    │
    ├──► Parse manifest widgets
    ├──► Extract header hints
    ├──► Generate registry entries
    └──► return registry

generateClientHooks(registry)
    │
    ├──► For each widget
    ├──► Generate useWidgetData hook
    └──► return hooks code
```

## 5. Design Patterns

- **Adapter Pattern**: Studio adapter for plugins
- **Factory Pattern**: Registry generation
- **Strategy Pattern**: Widget type mapping
- **Cache Pattern**: Component caching

## 6. Performance Architecture

- **Time Complexity**: O(n) for registry generation, O(1) for component resolution
- **Space Complexity**: O(n) where n = number of widgets
- **Bottlenecks**: Registry generation for large manifests

## 7. Security Architecture

- **Component Loading**: Dynamic imports with path validation
- **Header Hints**: Header policy hints from manifest
- **Data Source Validation**: Data source validation

---

**Last Updated**: 2025-11-16

