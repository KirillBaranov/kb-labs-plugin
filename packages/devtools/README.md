# @kb-labs/plugin-devtools

Development tools for Plugin Model v2 - OpenAPI/registry codegen, linting, and CLI commands.

## Features

- OpenAPI spec generation from manifests
- Studio registry codegen
- Manifest linting
- CLI commands for codegen and linting

## Usage

```typescript
import { generateOpenAPI, generateStudioRegistry, lintManifest } from '@kb-labs/plugin-devtools';

// Generate OpenAPI
await generateOpenAPI(manifest, 'dist/openapi/ai-review.json');

// Generate Studio registry
await generateStudioRegistry([manifest1, manifest2], 'dist/studio/registry.json');

// Lint manifest
const result = lintManifest(manifest);
```
