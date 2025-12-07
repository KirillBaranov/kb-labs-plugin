# Package Architecture Description: @kb-labs/plugin-adapter-cli

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/plugin-adapter-cli** provides CLI adapter for KB Labs plugins. It maps manifest CLI commands to CLI framework, handling command registration, flag mapping, handler binding, error handling, and debug mode.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide CLI adapter for plugin commands.

**Scope Boundaries**:
- **In Scope**: Command registration, flag mapping, handler binding, error handling
- **Out of Scope**: Command discovery (in cli-commands), runtime execution (in plugin-runtime)

**Domain**: Plugin System / CLI Adapter

### 1.2 Key Responsibilities

1. **Command Registration**: Register commands from manifest
2. **Flag Mapping**: Map manifest flags to CLI flags
3. **Handler Binding**: Bind handlers to commands
4. **Error Handling**: Handle errors with ErrorEnvelope
5. **Debug Support**: Debug mode for development

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
CLI Adapter
    │
    ├──► Command Registration (from manifest)
    ├──► Flag Mapping (type mapping)
    ├──► Handler Binding (runtime.execute)
    ├──► Error Handling (ErrorEnvelope)
    └──► Debug Mode (permission diffs)
```

### 2.2 Architectural Style

- **Style**: Adapter Pattern
- **Rationale**: Adapt plugin manifests to CLI framework

## 3. Component Architecture

### 3.1 Component: Command Registration

- **Purpose**: Register commands from manifest
- **Responsibilities**: Parse manifest, register commands
- **Dependencies**: plugin-manifest, cli-core

### 3.2 Component: Flag Mapping

- **Purpose**: Map manifest flags to CLI flags
- **Responsibilities**: Type mapping, flag registration
- **Dependencies**: None

### 3.3 Component: Handler Binding

- **Purpose**: Bind handlers to commands
- **Responsibilities**: Handler execution, error handling
- **Dependencies**: plugin-runtime

## 4. Data Flow

```
registerCommands(manifest, registry, options)
    │
    ├──► Parse manifest commands
    ├──► Map flags
    ├──► Register commands
    ├──► Bind handlers
    └──► return registered commands
```

## 5. Design Patterns

- **Adapter Pattern**: CLI adapter for plugins
- **Factory Pattern**: Command registration
- **Strategy Pattern**: Flag mapping strategies

## 6. Performance Architecture

- **Time Complexity**: O(n) for command registration, O(1) for execution
- **Space Complexity**: O(n) where n = number of commands
- **Bottlenecks**: Command registration for large manifests

## 7. Security Architecture

- **Input Validation**: All inputs validated
- **Permission Checking**: Capability checks before execution
- **Sandbox Execution**: Commands execute in sandbox (via runtime)

---

**Last Updated**: 2025-11-16

