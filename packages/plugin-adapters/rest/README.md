# @kb-labs/plugin-adapter-rest

REST API adapter for KB Labs plugins, providing HTTP endpoints for plugin functionality.

## Vision & Purpose

**@kb-labs/plugin-adapter-rest** provides REST API adapter for Plugin Model v2. It maps manifest REST routes to Fastify routes with OpenAPI generation, input/output validation, error handling, and security headers.

### Core Goals

- **Dynamic Route Mounting**: Mount routes from manifest
- **OpenAPI Generation**: Generate OpenAPI specs from manifest
- **Input/Output Validation**: Zod schema validation
- **Error Handling**: ErrorEnvelope mapping
- **Security**: Header policies and security schemes

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
REST Adapter
    │
    ├──► Route Mounting (from manifest)
    ├──► OpenAPI Generation
    ├──► Input/Output Validation
    ├──► Error Handling
    └──► Header Policy Enforcement
```

### Key Components

1. **Route Mounting** (`mount.ts`): Mounts routes from manifest to Fastify
2. **OpenAPI Generation** (`openapi.ts`): Generates OpenAPI specs
3. **Validation** (`validation.ts`): Zod schema validation
4. **Error Handling** (`errors.ts`): ErrorEnvelope mapping
5. **Header Policy** (`header-policy.ts`): Header policy resolution

## ✨ Features

- **Dynamic route mounting** from manifest
- **Zod input/output validation**
- **OpenAPI spec generation**
- **Error mapping** to ErrorEnvelope
- **Security schemes** support
- **Header policy** enforcement
- **Rate limiting** support
- **Timeout management**

## 📦 API Reference

### Main Exports

#### Route Mounting Functions

- `mountRoutes(app, manifest, runtime, options)`: Mount routes from manifest
- `executeRoute(route, manifest, request, reply, ...)`: Execute route handler

#### Validation Functions

- `resolveSchema(schemaRef, basePath)`: Resolve schema from SchemaRef
- `validateData(data, schema)`: Validate data against schema

#### Error Functions

- `handleError(error, reply)`: Map error to ErrorEnvelope
- `createErrorGuard(handler)`: Create error guard wrapper

#### OpenAPI Functions

- `generateOpenAPI(manifest)`: Generate OpenAPI spec from manifest

#### Header Policy Functions

- `resolveHeaderPolicy(manifest, route, basePath)`: Resolve header policy
- `compileHeaderPolicy(policy)`: Compile header policy

### Types & Interfaces

#### `PluginRuntime`

```typescript
interface PluginRuntime {
  execute<I, O>(
    handlerRef: string,
    input: I,
    context: Record<string, unknown>
  ): Promise<{ success: boolean; data?: O; error?: unknown }>;
}
```

#### `MountOptions`

```typescript
interface MountOptions {
  grantedCapabilities?: string[];
  basePath?: string;
  pluginRoot?: string;
  workdir?: string;
  fallbackTimeoutMs?: number;
  rateLimit?: {
    max: number;
    timeWindow: string;
  };
  onRouteMounted?: (info: {...}) => void;
}
```

#### `OpenAPISpec`

```typescript
interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
}
```

## 🔧 Configuration

### Configuration Options

All configuration via `MountOptions`:

- **grantedCapabilities**: Capabilities granted to plugin
- **basePath**: Base path for routes (default: `/v1/plugins/${pluginId}`)
- **pluginRoot**: Plugin root directory (required)
- **workdir**: Working directory
- **fallbackTimeoutMs**: Fallback timeout in milliseconds
- **rateLimit**: Rate limiting configuration
- **onRouteMounted**: Callback when route is mounted

### Environment Variables

- `KB_LABS_WORKSPACE_ROOT`: Workspace root directory
- `KB_LABS_REPO_ROOT`: Repository root directory
- `KB_PLUGIN_DEV_MODE`: Enable dev mode

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/plugin-manifest` (`workspace:*`): Plugin manifest
- `@kb-labs/plugin-runtime` (`workspace:*`): Plugin runtime
- `@kb-labs/core-workspace` (`workspace:*`): Core workspace
- `@kb-labs/core-sys` (`workspace:*`): Core sys
- `@kb-labs/sandbox` (`workspace:*`): Sandbox package
- `@kb-labs/api-contracts` (`workspace:*`): API contracts
- `fastify` (`^4.28.1`): Fastify framework
- `zod` (`^4.1.5`): Schema validation
- `zod-to-openapi` (`^0.2.1`): Zod to OpenAPI conversion
- `minimatch` (`^10.0.1`): Pattern matching

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

- **Time Complexity**: O(n) for route mounting, O(1) for execution
- **Space Complexity**: O(n) where n = number of routes
- **Bottlenecks**: Route mounting for large manifests

## 🔒 Security

### Security Considerations

- **Input Validation**: All inputs validated with Zod
- **Permission Checking**: Capability checks before execution
- **Header Policy**: Header policy enforcement
- **Security Headers**: CORS, HSTS, CSP support
- **Rate Limiting**: Rate limiting support

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **OpenAPI $ref**: Limited OpenAPI $ref support (Zod schemas preferred)
- **Security Schemes**: Basic security scheme support

### Future Improvements

- **Enhanced OpenAPI Support**: Better OpenAPI $ref support
- **More Security Schemes**: Additional security scheme support

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Mount Routes

```typescript
import { mountRoutes } from '@kb-labs/plugin-adapter-rest';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import Fastify from 'fastify';

const app = Fastify();

await mountRoutes(app, manifest, runtime, {
  grantedCapabilities: ['fs.read'],
  pluginRoot: '/path/to/plugin',
  basePath: '/v1/plugins/my-plugin',
});
```

### Example 2: Generate OpenAPI

```typescript
import { generateOpenAPI } from '@kb-labs/plugin-adapter-rest';

const openapi = generateOpenAPI(manifest);
console.log(JSON.stringify(openapi, null, 2));
```

### Example 3: Error Handling

```typescript
import { createErrorGuard } from '@kb-labs/plugin-adapter-rest';

const handler = createErrorGuard(async (request, reply) => {
  // Handler logic
});
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
