# KB Labs Plugin System (@kb-labs/plugin)

> **Plugin system infrastructure for KB Labs ecosystem.** Manifest definitions, runtime execution, adapters for CLI/REST/Studio, and developer tools.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision

KB Labs Plugin System provides a unified infrastructure for creating, managing, and executing plugins across the KB Labs ecosystem. It defines the plugin manifest format, provides runtime execution engine, and offers adapters for different integration points (CLI, REST API, Studio UI).

The project solves the problem of plugin standardization and cross-platform integration by providing:
- **Standardized manifest format** (V1/V2) for plugin definitions
- **Unified runtime** for plugin execution with sandboxing and permissions
- **Platform adapters** for seamless integration with CLI, REST API, and Studio
- **Developer tools** for plugin development and debugging

This project is part of the **@kb-labs** ecosystem and serves as the foundation for all plugin development.

## 🚀 Quick Start

### Installation

```bash
# Clone repository
git clone https://github.com/kirill-baranov/kb-labs-plugin.git
cd kb-labs-plugin

# Install dependencies
pnpm install
```

### Development

```bash
# Start development mode for all packages
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint
```

## 📁 Repository Structure

```
kb-labs-plugin/
├── packages/
│   ├── manifest/          # Plugin manifest definitions (V1/V2)
│   ├── runtime/           # Plugin execution runtime with sandboxing
│   ├── adapters/
│   │   ├── cli/           # CLI adapter for plugin commands
│   │   ├── rest/          # REST API adapter for plugin routes
│   │   └── studio/        # Studio UI adapter for plugin components
│   └── devtools/          # Developer tools for plugin development
└── docs/                  # Documentation
```

## 📦 Packages

| Package | Description |
|---------|-------------|
| [@kb-labs/plugin-manifest](./packages/manifest/) | Plugin manifest definitions, validation, and V1/V2 compatibility |
| [@kb-labs/plugin-runtime](./packages/runtime/) | Plugin execution engine with sandboxing, permissions, and resource management |
| [@kb-labs/plugin-adapter-cli](./packages/adapters/cli/) | CLI adapter for exposing plugin commands |
| [@kb-labs/plugin-adapter-rest](./packages/adapters/rest/) | REST API adapter for exposing plugin routes |
| [@kb-labs/plugin-adapter-studio](./packages/adapters/studio/) | Studio UI adapter for plugin components |
| [@kb-labs/plugin-devtools](./packages/devtools/) | Developer tools for plugin development and debugging |

### Package Details

#### @kb-labs/plugin-manifest

Defines the plugin manifest format (V1 and V2) with:
- TypeScript types and Zod schemas
- Validation utilities
- V1 to V2 migration helpers
- Manifest version detection

**Key Features:**
- Support for V1 (legacy) and V2 (modern) manifests
- Automatic validation and error reporting
- Type-safe manifest definitions

#### @kb-labs/plugin-runtime

Provides the plugin execution engine with:
- Sandboxed execution (in-process or subprocess)
- Permission system (FS, network, environment)
- Resource quotas (timeout, memory, CPU)
- Cross-plugin invocation support
- Error handling and logging

**Key Features:**
- Isolated execution environment
- Configurable permissions and quotas
- Support for cross-plugin calls via InvokeBroker
- Comprehensive error handling with ErrorEnvelope

#### @kb-labs/plugin-adapter-cli

CLI adapter for exposing plugin commands:
- Command registration and discovery
- Argument parsing and validation
- Help generation
- Output formatting

**Usage:**
```typescript
import { registerCliCommands } from '@kb-labs/plugin-adapter-cli';

// Register plugin commands from manifest
await registerCliCommands(manifest, program);
```

#### @kb-labs/plugin-adapter-rest

REST API adapter for exposing plugin routes:
- Route registration with Fastify
- Request/response validation
- OpenAPI spec generation
- Error handling

**Usage:**
```typescript
import { registerRestRoutes } from '@kb-labs/plugin-adapter-rest';

// Register plugin routes from manifest
await registerRestRoutes(manifest, fastify, basePath);
```

#### @kb-labs/plugin-adapter-studio

Studio UI adapter for plugin components:
- Component registration
- UI schema definitions
- Props validation

**Usage:**
```typescript
import { registerStudioComponents } from '@kb-labs/plugin-adapter-studio';

// Register plugin UI components from manifest
await registerStudioComponents(manifest, studio);
```

#### @kb-labs/plugin-devtools

Developer tools for plugin development:
- Plugin introspection
- Manifest validation
- Runtime debugging
- Performance profiling

## 🏗️ Architecture

### Plugin Manifest

Plugins are defined using manifest files (V1 or V2 format):

```json
{
  "id": "@acme/my-plugin",
  "version": "1.0.0",
  "manifestVersion": "2.0",
  "cli": {
    "commands": [
      {
        "id": "greet",
        "handler": "./cli/greet.js#handle",
        "description": "Greet someone"
      }
    ]
  },
  "rest": {
    "routes": [
      {
        "method": "POST",
        "path": "/greet",
        "handler": "./rest/greet.js#handle"
      }
    ]
  },
  "permissions": {
    "fs": {
      "mode": "read",
      "allow": ["./data/**"]
    },
    "net": {
      "allowHosts": ["api.example.com"]
    }
  }
}
```

### Plugin Execution Flow

1. **Discovery**: Plugins are discovered via multiple strategies (workspace, package.json, directory, file)
2. **Validation**: Manifests are validated against schemas
3. **Registration**: Plugins are registered with appropriate adapters (CLI/REST/Studio)
4. **Execution**: Handlers are executed in sandboxed environment with permissions and quotas
5. **Monitoring**: Execution is monitored with metrics, logs, and traces

### Cross-Plugin Invocation

Plugins can invoke other plugins via the InvokeBroker:

```typescript
// In plugin handler
const result = await invokeBroker.invoke({
  target: '@other-plugin@1.0.0:POST /api/endpoint',
  input: { data: 'value' }
});
```

## 📚 Documentation

- [Plugin Manifest Format](./docs/manifest.md) - Manifest V1/V2 specification
- [Plugin Runtime Guide](./docs/runtime.md) - Runtime execution and sandboxing
- [Creating Adapters](./docs/adapters.md) - How to create new adapters
- [Plugin Development](./docs/development.md) - Plugin development guide
- [Architecture Decisions](./docs/adr/) - ADRs for this project

## 🔧 Requirements

- **Node.js**: >= 18.18.0
- **pnpm**: >= 9.0.0

## 🔗 Related Packages

### Dependencies

- [@kb-labs/sandbox](../../kb-labs-core/packages/sandbox/) - Sandbox execution engine
- [@kb-labs/api-contracts](../../kb-labs-api-contracts/packages/api-contracts/) - API contracts and types
- [@kb-labs/cli-core](../../kb-labs-cli/packages/core/) - CLI core utilities

### Used By

- [kb-labs-cli](../../kb-labs-cli/) - CLI implementation
- [kb-labs-rest-api](../../kb-labs-rest-api/) - REST API implementation
- [kb-labs-studio](../../kb-labs-studio/) - Studio UI implementation

### Ecosystem

- [KB Labs](https://github.com/KirillBaranov/kb-labs) - Main ecosystem repository

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.

## 📄 License

MIT © KB Labs

---

**See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.**


## License

KB Public License v1.1 - see [LICENSE](LICENSE) for details.

This is open source software with some restrictions on:
- Offering as a hosted service (SaaS/PaaS)
- Creating competing platform products

For commercial licensing inquiries: contact@kblabs.dev

**User Guides:**
- [English Guide](../LICENSE-GUIDE.en.md)
- [Русское руководство](../LICENSE-GUIDE.ru.md)
