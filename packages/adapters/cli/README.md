# @kb-labs/plugin-adapter-cli

CLI adapter for Plugin Model v2 - maps manifest CLI commands to CLI framework.

## Features

- Dynamic command registration from manifest
- Flag mapping (string, boolean, number, array)
- Handler binding with runtime.execute
- Error handling with ErrorEnvelope
- Debug mode with permission diffs

## Usage

```typescript
import { registerCommands } from '@kb-labs/plugin-adapter-cli';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

// Register commands from manifest
await registerCommands(manifest, program, runtime);
```
