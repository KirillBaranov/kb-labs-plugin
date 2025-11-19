# @kb-labs/plugin-contracts

Type definitions and contracts for KB Labs plugin runtime APIs (Shell, Artifacts, Invoke, etc.).

## Purpose

This package provides centralized, versioned type definitions for plugin runtime APIs to ensure consistency across all KB Labs plugins. It eliminates type duplication and provides a single source of truth for API contracts.

## Versioning

### Package Version (SemVer)
- **MAJOR**: Breaking changes in API contracts
- **MINOR**: New fields added (backward compatible)
- **PATCH**: Type corrections, documentation updates

### API Version (v1, v2, etc.)
Types are versioned with suffixes (e.g., `ShellApiV1`, `ShellResultV1`) to allow multiple API versions to coexist. The current version is also exported without suffix for convenience (e.g., `ShellApi` = `ShellApiV1`).

## Usage

```typescript
import type { 
  ShellApi, 
  ShellResult, 
  ShellExecOptions,
  ArtifactsApi,
  ArtifactReadRequest,
  ArtifactWriteRequest,
  InvokeApi,
  InvokeRequest,
  InvokeResult,
} from '@kb-labs/plugin-contracts';

// Use Shell API
async function runCheck(shell: ShellApi) {
  const result: ShellResult = await shell.exec('tsc', ['--noEmit'], {
    cwd: process.cwd(),
    timeoutMs: 30000,
  });
  
  if (!result.ok) {
    throw new Error(`TypeScript check failed: ${result.stderr}`);
  }
}

// Use Artifacts API
async function readArtifact(artifacts: ArtifactsApi) {
  const data = await artifacts.read({
    uri: 'artifact://@kb-labs/other-plugin/data.json',
    accept: ['application/json'],
  });
}

// Use Invoke API
async function invokePlugin(invoke: InvokeApi) {
  const result: InvokeResult<{ status: string }> = await invoke.invoke({
    target: '@kb-labs/other-plugin@latest:GET /status',
    input: { query: 'test' },
  });
  
  if (result.ok) {
    console.log(result.data.status);
  }
}
```

## Structure

- `src/shell/v1.ts` - Shell API v1 types
- `src/shell/index.ts` - Shell API exports with versioning
- `src/artifacts/v1.ts` - Artifacts API v1 types
- `src/artifacts/index.ts` - Artifacts API exports with versioning
- `src/invoke/v1.ts` - Invoke API v1 types
- `src/invoke/index.ts` - Invoke API exports with versioning
- `src/index.ts` - Main exports

All API types follow the same versioning structure for consistency.

## Dependencies

This package has **zero runtime dependencies** - it only contains type definitions. This ensures:
- Fast installation
- No version conflicts
- Can be used in any TypeScript project

## Migration Guide

### From plugin-runtime types

```typescript
// Before
import type { ShellResult } from '@kb-labs/plugin-runtime/shell/types';

// After
import type { ShellResult } from '@kb-labs/plugin-contracts';
```

### From audit-core ShellApi

```typescript
// Before
import type { ShellApi } from '@kb-labs/audit-core';

// After
import type { ShellApi } from '@kb-labs/plugin-contracts';
```

## Related Packages

- `@kb-labs/plugin-manifest` - Plugin manifest types (ManifestV2, PermissionSpec)
- `@kb-labs/plugin-runtime` - Runtime implementation (uses contracts for types)

