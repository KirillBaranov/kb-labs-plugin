# Package Architecture Description: @kb-labs/plugin-adapter-rest

**Version**: 0.1.0
**Last Updated**: 2025-11-16

## Executive Summary

**@kb-labs/plugin-adapter-rest** provides REST API adapter for KB Labs plugins. It maps manifest REST routes to Fastify routes with OpenAPI generation, input/output validation, error handling, and security headers.

## 1. Package Overview

### 1.1 Purpose & Scope

**Primary Purpose**: Provide REST API adapter for plugin routes.

**Scope Boundaries**:
- **In Scope**: Route mounting, OpenAPI generation, validation, error handling, header policies
- **Out of Scope**: Route discovery (in cli-commands), runtime execution (in plugin-runtime)

**Domain**: Plugin System / REST Adapter

### 1.2 Key Responsibilities

1. **Route Mounting**: Mount routes from manifest to Fastify
2. **OpenAPI Generation**: Generate OpenAPI specs from manifest
3. **Input/Output Validation**: Zod schema validation
4. **Error Handling**: ErrorEnvelope mapping
5. **Header Policy**: Header policy enforcement

## 2. High-Level Architecture

### 2.1 Architecture Diagram

```
REST Adapter
    │
    ├──► Route Mounting (mount.ts)
    │   ├──► Parse manifest routes
    │   ├──► Resolve schemas
    │   ├──► Compile header policies
    │   └──► Register Fastify routes
    │
    ├──► OpenAPI Generation (openapi.ts)
    │   ├──► Convert routes to OpenAPI paths
    │   ├──► Generate schemas
    │   └──► Generate security schemes
    │
    ├──► Validation (validation.ts)
    │   ├──► Resolve schemas (Zod/OpenAPI)
    │   └──► Validate data
    │
    ├──► Error Handling (errors.ts)
    │   ├──► Map errors to ErrorEnvelope
    │   └──► Error guard wrapper
    │
    └──► Header Policy (header-policy.ts)
        ├──► Resolve header policies
        └──► Compile header validators
```

### 2.2 Architectural Style

- **Style**: Adapter Pattern
- **Rationale**: Adapt plugin manifests to Fastify framework

## 3. Component Architecture

### 3.1 Component: Route Mounting

- **Purpose**: Mount routes from manifest
- **Responsibilities**: Parse manifest, register routes, handle timeouts
- **Dependencies**: fastify, plugin-manifest, plugin-runtime

### 3.2 Component: OpenAPI Generation

- **Purpose**: Generate OpenAPI specs
- **Responsibilities**: Convert routes to OpenAPI, generate schemas
- **Dependencies**: plugin-manifest

### 3.3 Component: Validation

- **Purpose**: Validate input/output
- **Responsibilities**: Resolve schemas, validate data
- **Dependencies**: zod, plugin-manifest

### 3.4 Component: Error Handling

- **Purpose**: Handle errors
- **Responsibilities**: Map errors to ErrorEnvelope, error guard
- **Dependencies**: api-contracts, fastify

### 3.5 Component: Header Policy

- **Purpose**: Enforce header policies
- **Responsibilities**: Resolve policies, compile validators
- **Dependencies**: plugin-manifest

## 4. Data Flow

```
mountRoutes(app, manifest, runtime, options)
    │
    ├──► Parse manifest routes
    ├──► Resolve schemas
    ├──► Compile header policies
    ├──► Register Fastify routes
    └──► return mounted routes

executeRoute(route, manifest, request, reply, ...)
    │
    ├──► Extract input from request
    ├──► Validate input
    ├──► Execute handler (via runtime)
    ├──► Validate output
    └──► Send response
```

## 5. Design Patterns

- **Adapter Pattern**: REST adapter for plugins
- **Factory Pattern**: Route registration
- **Strategy Pattern**: Validation strategies
- **Guard Pattern**: Error guard wrapper

## 6. Performance Architecture

- **Time Complexity**: O(n) for route mounting, O(1) for execution
- **Space Complexity**: O(n) where n = number of routes
- **Bottlenecks**: Route mounting for large manifests

## 7. Security Architecture

- **Input Validation**: All inputs validated with Zod
- **Permission Checking**: Capability checks before execution
- **Header Policy**: Header policy enforcement
- **Security Headers**: CORS, HSTS, CSP support
- **Rate Limiting**: Rate limiting support

---

**Last Updated**: 2025-11-16

