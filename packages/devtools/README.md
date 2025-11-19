# @kb-labs/plugin-devtools

Development tools for KB Labs plugins, including debugging and inspection utilities.

## Vision & Purpose

**@kb-labs/plugin-devtools** provides development tools for Plugin Model v2. It includes OpenAPI spec generation, Studio registry codegen, manifest linting, CLI commands, and file watching for development workflows.

### Core Goals

- **OpenAPI Generation**: Generate OpenAPI specs from manifests
- **Studio Registry Codegen**: Generate Studio registry from manifests
- **Manifest Linting**: Lint manifests for errors and warnings
- **CLI Commands**: CLI commands for codegen and linting
- **File Watching**: Watch for manifest changes and regenerate

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
DevTools
    │
    ├──► OpenAPI Generation
    ├──► Studio Registry Codegen
    ├──► Manifest Linting
    ├──► CLI Commands
    └──► File Watching
```

### Key Components

1. **OpenAPI** (`openapi.ts`): Generate OpenAPI specs from manifests
2. **Registry** (`registry.ts`): Generate Studio registry from manifests
3. **Linting** (`lint.ts`): Lint manifests for errors and warnings
4. **CLI** (`cli.ts`): CLI commands for codegen and linting
5. **Watch** (`watch.ts`): File watching for development
6. **Condition** (`condition.ts`): Condition interpreter for widget visibility

## ✨ Features

- **OpenAPI spec generation** from manifests
- **Studio registry codegen** from manifests
- **Manifest linting** with error/warning reporting
- **CLI commands** for codegen and linting
- **File watching** for development workflows
- **Condition interpreter** for widget visibility

## 📦 API Reference

### Main Exports

#### OpenAPI Functions

- `generateOpenAPIFile(manifest, outputPath)`: Generate OpenAPI spec for a single plugin
- `generateOpenAPIs(manifests, outputDir)`: Generate OpenAPI specs for multiple plugins
- `mergeOpenAPIs(manifests, outputPath)`: Merge multiple OpenAPI specs into one
- `generateOpenAPI(manifest, outputPath)`: Alias for `generateOpenAPIFile`

#### Registry Functions

- `generateStudioRegistry(manifests, outputPath)`: Generate Studio registry from manifests

#### Linting Functions

- `lintManifest(manifest, cwd)`: Lint manifest for errors and warnings

#### Watch Functions

- `watchManifests(manifestPaths, outputPath, onChanged)`: Watch for manifest changes and regenerate registry

#### CLI Functions

- `createGenerateOpenAPICommand()`: Create OpenAPI generation command
- `createGenerateStudioRegistryCommand()`: Create Studio registry generation command
- `createLintPluginCommand()`: Create lint command
- `registerDevtoolsCommands(registry)`: Register all devtools commands

#### Condition Functions

- `parseCondition(condition)`: Parse condition expression
- `evaluateCondition(condition, context)`: Evaluate condition expression
- `validateCondition(condition)`: Validate condition in manifest

### Types & Interfaces

#### `LintResult`

```typescript
interface LintResult {
  valid: boolean;
  errors: LintError[];
  warnings: LintError[];
}
```

#### `LintError`

```typescript
interface LintError {
  code: string;
  message: string;
  location?: string;
  severity: 'error' | 'warning';
}
```

#### `ConditionContext`

```typescript
interface ConditionContext {
  ctx: {
    userId?: string;
    role?: string;
    profile?: string;
    env?: string;
  };
  metrics: Record<string, number>;
  flags: Record<string, boolean>;
}
```

## 🔧 Configuration

### Configuration Options

All configuration via function parameters:

- **outputPath**: Output path for generated files
- **outputDir**: Output directory for generated files
- **manifestPattern**: Glob pattern for manifest files
- **watchMode**: Enable watch mode

### Environment Variables

- None (runtime configuration only)

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/cli-core` (`link:../../../kb-labs-cli/packages/core`): CLI core
- `@kb-labs/plugin-adapter-rest` (`link:../adapters/rest`): REST adapter (for OpenAPI generation)
- `@kb-labs/plugin-adapter-studio` (`link:../adapters/studio`): Studio adapter (for registry generation)
- `@kb-labs/plugin-manifest` (`link:../manifest`): Plugin manifest
- `@kb-labs/plugin-runtime` (`link:../runtime`): Plugin runtime
- `glob` (`^11.0.0`): File pattern matching

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.10.0`): Node.js types
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

- **Time Complexity**: O(n) for generation, O(1) for linting
- **Space Complexity**: O(n) where n = number of manifests
- **Bottlenecks**: OpenAPI generation for large manifests

## 🔒 Security

### Security Considerations

- **File System Access**: File system operations for codegen
- **Manifest Validation**: Manifest validation before processing
- **Path Validation**: Path validation for file operations

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Condition Interpreter**: Placeholder implementation (TODO)
- **OpenAPI Generation**: Basic OpenAPI generation (enhancements planned)

### Future Improvements

- **Full Condition Interpreter**: Complete condition interpreter implementation
- **Enhanced OpenAPI Generation**: Better OpenAPI generation support

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Generate OpenAPI

```typescript
import { generateOpenAPI } from '@kb-labs/plugin-devtools';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

await generateOpenAPI(manifest, 'dist/openapi/ai-review.json');
```

### Example 2: Generate Studio Registry

```typescript
import { generateStudioRegistry } from '@kb-labs/plugin-devtools';

await generateStudioRegistry([manifest1, manifest2], 'dist/studio/registry.json');
```

### Example 3: Lint Manifest

```typescript
import { lintManifest } from '@kb-labs/plugin-devtools';

const result = await lintManifest(manifest, process.cwd());
if (!result.valid) {
  console.error('Lint errors:', result.errors);
}
```

### Example 4: Watch Manifests

```typescript
import { watchManifests } from '@kb-labs/plugin-devtools';

const cleanup = await watchManifests(
  ['plugins/*/manifest.v2.ts'],
  'dist/studio/registry.json',
  (changedFiles) => {
    console.log('Changed files:', changedFiles);
  }
);

// Later: cleanup();
```

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
