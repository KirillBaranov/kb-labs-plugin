# @kb-labs/plugin-runtime

> **Runtime environment for KB Labs plugins, handling execution, permissions, and sandboxing.** Plugin runtime execution engine with capabilities, permissions, quota management, analytics integration, sandbox execution, and artifact management.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/plugin-runtime** provides runtime environment for KB Labs plugins. It handles plugin execution, permissions, sandboxing, capabilities, quota management, analytics integration, artifact management, and event system.

### What Problem Does This Solve?

- **Plugin Execution**: Plugins need execution environment - runtime provides runtime
- **Security**: Need secure plugin execution - runtime provides sandboxing and permissions
- **Capabilities**: Need capability-based security - runtime provides capabilities
- **Quota Management**: Need resource limits - runtime provides quota management
- **Analytics**: Need analytics integration - runtime provides analytics

### Why Does This Package Exist?

- **Unified Runtime**: All plugins use the same runtime environment
- **Security**: Centralized security controls
- **Resource Management**: Centralized resource limits
- **Analytics**: Unified analytics integration

### What Makes This Package Unique?

- **Sandbox Execution**: Fork-based and in-process sandboxing
- **Capability-Based Security**: Fine-grained capability checks
- **Permission System**: Comprehensive permission validation
- **Artifact Management**: Artifact writing with path templating
- **Event System**: Plugin event bus

## 📊 Package Status

### Development Stage

- [x] **Experimental** - Early development, API may change
- [x] **Alpha** - Core features implemented, testing phase
- [x] **Beta** - Feature complete, API stable, production testing
- [x] **Stable** - Production ready, API frozen
- [ ] **Maintenance** - Bug fixes only, no new features
- [ ] **Deprecated** - Will be removed in future version

**Current Stage**: **Stable**

**Target Stage**: **Stable** (maintained)

### Maturity Indicators

- **Test Coverage**: ~85% (target: 90%)
- **TypeScript Coverage**: 100% (target: 100%)
- **Documentation Coverage**: 70% (target: 100%)
- **API Stability**: Stable
- **Breaking Changes**: None in last 6 months
- **Last Major Version**: 0.1.0
- **Next Major Version**: 1.0.0

### Production Readiness

- [x] **API Stability**: API is stable
- [x] **Error Handling**: Comprehensive error handling
- [x] **Logging**: Structured logging
- [x] **Testing**: Unit tests present
- [x] **Performance**: Efficient execution
- [x] **Security**: Sandboxing, permissions, capabilities
- [x] **Documentation**: API documentation
- [x] **Migration Guide**: N/A (no breaking changes)

## 🏗️ Architecture

### High-Level Architecture

The plugin-runtime package provides runtime environment:

```
Plugin Runtime
    │
    ├──► Execution Engine (handler execution)
    ├──► Sandbox System (fork, in-process)
    ├──► Permission System (fs, net, env, quotas)
    ├──► Capability System (capability checks)
    ├──► Artifact Management (artifact writing)
    ├──► Event System (event bus)
    └──► Analytics Integration (analytics SDK)
```

### Core Components

#### Execution Engine

- **Purpose**: Execute plugin handlers
- **Responsibilities**: Handler loading, execution, validation
- **Dependencies**: sandbox, permissions, capabilities

#### Sandbox System

- **Purpose**: Isolate plugin execution
- **Responsibilities**: Fork-based and in-process sandboxing
- **Dependencies**: sandbox package

#### Permission System

- **Purpose**: Validate permissions
- **Responsibilities**: FS, network, environment, quota validation
- **Dependencies**: None

### Design Patterns

- **Sandbox Pattern**: Isolated execution
- **Capability Pattern**: Capability-based security
- **Event Bus Pattern**: Plugin events
- **Facade Pattern**: Presenter facade

### Data Flow

```
execute(handlerRef, input, context, manifest)
    │
    ├──► Validate permissions
    ├──► Check capabilities
    ├──► Create sandbox
    ├──► Execute handler
    ├──► Write artifacts
    └──► return result
```

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/plugin-runtime
```

### Basic Usage

```typescript
import { execute, createPluginContext } from '@kb-labs/plugin-runtime';

const context = createPluginContext({
  capabilities: ['fs.read'],
  permissions: { fs: { mode: 'read', allow: ['.'] } },
});

const result = await execute(
  './handlers/review.js#handle',
  input,
  context,
  manifest
);
```

## ✨ Features

- **Capability-based security checks** - Fine-grained capability validation
- **Permission validation** - FS, network, environment, quota validation
- **Handler execution wrapper** - Validation, quotas, error handling
- **Artifact writing** - Path templating and artifact management
- **Analytics integration** - Via @kb-labs/analytics-sdk-node
- **Sandbox execution** - Fork-based and in-process sandboxing
- **Event system** - Plugin event bus
- **Snapshot system** - Execution snapshots
- **Trace system** - Execution tracing

## 📦 API Reference

### Main Exports

#### Execution Functions

- `execute(args, ctx, registry?)`: Execute plugin handler
- `createPluginContext(options)`: Create plugin context

#### Permission Functions

- `checkFsPermission(path, permission)`: Check FS permission
- `checkNetPermission(url, permission)`: Check network permission
- `checkEnvPermission(key, permission)`: Check environment permission
- `checkAllPermissions(checks)`: Check all permissions

#### Capability Functions

- `checkCapabilities(required, granted)`: Check capabilities
- `validateCapabilityNames(names)`: Validate capability names

#### Artifact Functions

- `writeArtifact(context, data)`: Write artifact
- `ArtifactBroker`: Artifact broker for artifact operations

#### Event Functions

- `createEventBus(config?)`: Create event bus
- `acquirePluginBus(pluginId)`: Acquire plugin event bus

### Types & Interfaces

See detailed API documentation in code comments and exports.

## 🔧 Configuration

### Configuration Options

Runtime configuration via `ExecutionContext` and `PluginContextOptions`.

### Environment Variables

- `KB_LOG_LEVEL`: Logging level for runtime operations

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/setup-operations` (`workspace:*`): Setup operations
- `@kb-labs/analytics-sdk-node` (`workspace:*`): Analytics SDK
- `@kb-labs/api-contracts` (`workspace:*`): API contracts
- `@kb-labs/plugin-manifest` (`workspace:*`): Plugin manifest
- `@kb-labs/sandbox` (`workspace:*`): Sandbox package
- `minimatch` (`^10.0.1`): Pattern matching
- `semver` (`^7.6.3`): Semantic versioning
- `zod` (`^4.1.5`): Schema validation

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
├── capabilities.test.ts
└── permissions.test.ts

src/config/__tests__/
└── config-helper.test.ts

src/events/__tests__/
└── event-bus.test.ts

src/io/__tests__/
└── fs.test.ts

src/operations/__tests__/
└── operation-tracker.test.ts

src/registry/__tests__/
└── runtime-events.test.ts
```

### Test Coverage

- **Current Coverage**: ~85%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for permission checks, O(1) for capability checks
- **Space Complexity**: O(n) where n = number of operations
- **Bottlenecks**: Sandbox creation for fork-based execution

## 🔒 Security

### Security Considerations

- **Sandbox Isolation**: Fork-based and in-process sandboxing
- **Permission Validation**: Comprehensive permission checks
- **Capability Checks**: Fine-grained capability validation
- **Input Validation**: All inputs validated
- **Path Validation**: Path operations validated

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Sandbox Performance**: Fork-based sandboxing has overhead
- **Permission Checks**: Multiple permission checks may be slow

### Future Improvements

- **Async Permission Checks**: Parallel permission validation
- **Sandbox Optimization**: Optimize sandbox creation

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Basic Execution

```typescript
import { execute, createPluginContext } from '@kb-labs/plugin-runtime';

const context = createPluginContext({
  capabilities: ['fs.read'],
  permissions: { fs: { mode: 'read', allow: ['.'] } },
});

const result = await execute(
  { handler: { file: './handlers/review.js', export: 'handle' }, input: {} },
  context
);
```

### Example 2: Permission Checking

```typescript
import { checkFsPermission, checkNetPermission } from '@kb-labs/plugin-runtime';

const fsAllowed = checkFsPermission('/path/to/file', { mode: 'read', allow: ['.'] });
const netAllowed = checkNetPermission('https://api.example.com', { allow: ['api.example.com'] });
```

### Example 3: Capability Checking

```typescript
import { checkCapabilities } from '@kb-labs/plugin-runtime';

const result = checkCapabilities(['fs.read', 'net.fetch'], ['fs.read']);
// result.granted: ['fs.read']
// result.missing: ['net.fetch']
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
