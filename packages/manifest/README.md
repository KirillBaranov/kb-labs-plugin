# @kb-labs/plugin-manifest

Plugin Manifest v2 types, validation, and migration utilities for KB Labs plugin system.

## Features

- ManifestV2 TypeScript types
- JSON Schema validation
- V1→V2 migration support
- Compatibility detection
- Deprecation warnings

## Usage

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
