# Package Architecture Description: @kb-labs/plugin-devtools

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/plugin-devtools** provides development tools for KB Labs plugins. It includes OpenAPI spec generation, Studio registry codegen, manifest linting, CLI commands, and file watching for development workflows.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide development tools for plugin development.

**Scope Boundaries**:
- **In Scope**: OpenAPI generation, registry codegen, linting, CLI commands, file watching
- **Out of Scope**: Plugin execution (in plugin-runtime), manifest validation (in plugin-manifest)

**Domain**: Plugin System / Development Tools

### 1.2 Key Responsibilities

1. **OpenAPI Generation**: Generate OpenAPI specs from manifests
2. **Registry Codegen**: Generate Studio registry from manifests
3. **Linting**: Lint manifests for errors and warnings
4. **CLI Commands**: CLI commands for codegen and linting
5. **File Watching**: Watch for manifest changes and regenerate

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
DevTools
    │
    ├──► OpenAPI Generation (openapi.ts)
    │   ├──► Generate spec from manifest
    │   ├──► Merge multiple specs
    │   └──► Write to file
    │
    ├──► Studio Registry Codegen (registry.ts)
    │   ├──► Validate widgets
    │   ├──► Generate registry
    │   └──► Write to file
    │
    ├──► Manifest Linting (lint.ts)
    │   ├──► Validate path templates
    │   ├──► Check mutating routes
    │   ├──► Validate schema refs
    │   └──► Report errors/warnings
    │
    ├──► CLI Commands (cli.ts)
    │   ├──► OpenAPI generation command
    │   ├──► Registry generation command
    │   └──► Lint command
    │
    ├──► File Watching (watch.ts)
    │   ├──► Watch manifest files
    │   ├──► Debounce changes
    │   └──► Regenerate registry
    │
    └──► Condition Interpreter (condition.ts)
        ├──► Parse conditions
        ├──► Evaluate conditions
        └──► Validate conditions
```

### 2.2 Architectural Style

- **Style**: Tool Collection Pattern
- **Rationale**: Collection of development tools for plugin development

## 3. Component Architecture

### 3.1 Component: OpenAPI Generation

- **Purpose**: Generate OpenAPI specs
- **Responsibilities**: Generate specs, merge specs, write files
- **Dependencies**: plugin-adapter-rest, plugin-manifest

### 3.2 Component: Registry Codegen

- **Purpose**: Generate Studio registry
- **Responsibilities**: Validate widgets, generate registry, write files
- **Dependencies**: plugin-adapter-studio, plugin-manifest

### 3.3 Component: Linting

- **Purpose**: Lint manifests
- **Responsibilities**: Validate manifests, report errors/warnings
- **Dependencies**: plugin-manifest

### 3.4 Component: CLI Commands

- **Purpose**: CLI commands
- **Responsibilities**: Register commands, handle execution
- **Dependencies**: cli-core, plugin-manifest

### 3.5 Component: File Watching

- **Purpose**: Watch for changes
- **Responsibilities**: Watch files, debounce changes, regenerate
- **Dependencies**: plugin-manifest, registry codegen

### 3.6 Component: Condition Interpreter

- **Purpose**: Interpret conditions
- **Responsibilities**: Parse, evaluate, validate conditions
- **Dependencies**: None

## 4. Data Flow

```
generateOpenAPI(manifest, outputPath)
    │
    ├──► Generate spec (via plugin-adapter-rest)
    ├──► Write to file
    └──► return

generateStudioRegistry(manifests, outputPath)
    │
    ├──► Validate widgets
    ├──► Generate registry (via plugin-adapter-studio)
    ├──► Write to file
    └──► return

lintManifest(manifest, cwd)
    │
    ├──► Validate path templates
    ├──► Check mutating routes
    ├──► Validate schema refs
    └──► return lint result
```

## 5. Design Patterns

- **Tool Collection Pattern**: Collection of development tools
- **Factory Pattern**: Command creation
- **Observer Pattern**: File watching
- **Strategy Pattern**: Linting rules

## 6. Performance Architecture

- **Time Complexity**: O(n) for generation, O(1) for linting
- **Space Complexity**: O(n) where n = number of manifests
- **Bottlenecks**: OpenAPI generation for large manifests

## 7. Security Architecture

- **File System Access**: File system operations for codegen
- **Manifest Validation**: Manifest validation before processing
- **Path Validation**: Path validation for file operations

---

**Last Updated**: 2025-11-16

