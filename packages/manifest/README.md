# @kb-labs/plugin-manifest

> **Type definitions and validation schemas for KB Labs plugin manifests (ManifestV2).** Plugin Manifest v2 types, validation, and migration utilities for KB Labs plugin system with JSON Schema validation, V1→V2 migration support, and compatibility detection.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/plugin-manifest** provides type definitions and validation schemas for KB Labs plugin manifests. It includes ManifestV2 TypeScript types, JSON Schema validation, V1→V2 migration support, compatibility detection, and deprecation warnings.

### What Problem Does This Solve?

- **Manifest Types**: Plugins need manifest types - manifest provides types
- **Manifest Validation**: Need to validate manifests - manifest provides validation
- **Version Migration**: Need to migrate v1 to v2 - manifest provides migration
- **Compatibility**: Need compatibility detection - manifest provides detection
- **Type Safety**: Need type-safe manifests - manifest provides TypeScript types

### Why Does This Package Exist?

- **Unified Manifest Format**: All plugins use the same manifest format
- **Type Safety**: TypeScript types for manifests
- **Validation**: Centralized validation logic
- **Migration**: Support for v1→v2 migration

### What Makes This Package Unique?

- **Zod Schemas**: Zod-based validation with TypeScript types
- **Migration Support**: V1→V2 migration utilities
- **Compatibility Detection**: Automatic version detection
- **Deprecation Warnings**: Deprecation detection and warnings

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
- [x] **Logging**: N/A (validation only)
- [x] **Testing**: Unit tests present
- [x] **Performance**: Efficient validation
- [x] **Security**: Input validation
- [x] **Documentation**: API documentation
- [x] **Migration Guide**: V1→V2 migration support

## 🏗️ Architecture

### High-Level Architecture

The manifest package provides manifest types and validation:

```
Plugin Manifest
    │
    ├──► Type Definitions (ManifestV2 types)
    ├──► Schema Validation (Zod schemas)
    ├──► Migration Utilities (V1→V2)
    ├──► Compatibility Detection (version detection)
    └──► Deprecation Warnings (deprecation detection)
```

### Core Components

#### Type Definitions

- **Purpose**: Define manifest types
- **Responsibilities**: TypeScript types, Zod schemas
- **Dependencies**: zod, api-contracts

#### Validation

- **Purpose**: Validate manifests
- **Responsibilities**: Schema validation, error reporting
- **Dependencies**: zod

#### Migration

- **Purpose**: Migrate v1 to v2
- **Responsibilities**: V1→V2 conversion, compatibility
- **Dependencies**: None

### Design Patterns

- **Schema Pattern**: Zod-based validation
- **Type Pattern**: TypeScript types from schemas
- **Migration Pattern**: Version migration utilities

### Data Flow

```
validateManifestV2(manifest)
    │
    ├──► Parse manifest
    ├──► Validate schema
    ├──► Check compatibility
    └──► return validation result
```

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/plugin-manifest
```

### Basic Usage

```typescript
import { validateManifestV2, ManifestV2 } from '@kb-labs/plugin-manifest';

const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/my-plugin',
  version: '0.1.0',
  // ... manifest definition
};

const result = validateManifestV2(manifest);
if (!result.valid) {
  console.error(result.errors);
}
```

## ✨ Features

```typescript
import { validateManifestV2, migrateV1ToV2, detectManifestVersion } from '@kb-labs/plugin-manifest';

// Validate manifest
const result = validateManifestV2(manifest);
if (!result.valid) {
  console.error(result.errors);
}

// Migrate from v1
const v2Manifest = migrateV1ToV2(v1Manifest);

// Detect version
const version = detectManifestVersion(manifest); // 'v1' | 'v2'
```

## Setup section

Manifest v2 поддерживает опциональный раздел `setup`, позволяющий описать команду инициализации плагина:

```ts
export const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/ai-review',
  version: '1.0.0',
  setup: {
    handler: './setup/handler.js#run',
    describe: 'Initialize AI Review workspace',
    permissions: {
      fs: {
        mode: 'readWrite',
        allow: ['.kb/ai-review/**', '.gitignore'],
        deny: ['.kb/plugins.json', '.kb/kb-labs.config.json'],
      },
      net: 'none',
    },
  },
};
```

`permissions.fs` **обязателен** и должен ограничивать область записи setup-хендлера явными паттернами `allow`. CLI публикует команду `<namespace>:setup`, исполняет обработчик в sandbox с этими правами и самостоятельно мержит возвращённые конфигурации.

## 📦 API Reference

### Main Exports

#### Validation Functions

- `validateManifestV2(manifest)`: Validate ManifestV2
- `manifestV2Schema`: Zod schema for ManifestV2
- `permissionSpecSchema`: Zod schema for permission spec

#### Migration Functions

- `migrateV1ToV2(v1Manifest)`: Migrate v1 to v2
- `detectManifestVersion(manifest)`: Detect manifest version
- `checkDualManifest(manifest)`: Check for dual manifest

#### Deprecation Functions

- `isV1Allowed()`: Check if v1 is allowed
- `getDeprecationWarning()`: Get deprecation warning
- `shouldUseV1()`: Check if should use v1

### Types & Interfaces

#### `ManifestV2`

Main manifest type with all v2 features.

#### `PermissionSpec`

Permission specification with FS, network, environment, quotas, capabilities, invoke, artifacts, events.

#### `SchemaRef`

Schema reference (OpenAPI `$ref` or Zod schema path).

See detailed API documentation in code comments.

## 🔧 Configuration

### Configuration Options

No global configuration needed. Validation options passed per function call.

### Environment Variables

None.

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/api-contracts` (`link:`): API contracts
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
├── compat.test.ts
├── migrate.test.ts
└── schema.test.ts
```

### Test Coverage

- **Current Coverage**: ~85%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for validation, O(1) for type checks
- **Space Complexity**: O(n) where n = manifest size
- **Bottlenecks**: Large manifest validation

## 🔒 Security

### Security Considerations

- **Input Validation**: All inputs validated via Zod
- **Schema Validation**: Comprehensive schema validation
- **Type Safety**: TypeScript types prevent invalid data

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Validation Performance**: Large manifests may be slow
- **Migration**: Some v1 features may not map perfectly to v2

### Future Improvements

- **Async Validation**: Parallel validation for large manifests
- **Enhanced Migration**: Better v1→v2 migration

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

V1→V2 migration supported via `migrateV1ToV2()`.

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Manifest Definition

```typescript
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@kb-labs/my-plugin',
  version: '0.1.0',
  display: {
    name: 'My Plugin',
    description: 'Example plugin',
  },
  permissions: {
    fs: { mode: 'read', allow: ['.'] },
    net: 'none',
  },
  cli: {
    commands: [
      {
        id: 'my:command',
        group: 'my',
        describe: 'My command',
        handler: './commands/command.js#run',
      },
    ],
  },
};
```

### Example 2: Validation

```typescript
import { validateManifestV2 } from '@kb-labs/plugin-manifest';

const result = validateManifestV2(manifest);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

### Example 3: Migration

```typescript
import { migrateV1ToV2 } from '@kb-labs/plugin-manifest';

const v2Manifest = migrateV1ToV2(v1Manifest);
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
