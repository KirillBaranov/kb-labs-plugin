# @kb-labs/plugin-adapter-studio

Studio adapter for Plugin Model v2 - generates widget registry and client helpers.

## Features

- Widget registry generation from manifest
- Widget type mapping (panel, card, table, chart, custom)
- Client hooks generator for data binding
- Component resolution with dynamic imports
- Menu and layout support

## Usage

```typescript
import { toRegistry, generateClientHooks } from '@kb-labs/plugin-adapter-studio';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

// Generate registry
const registry = toRegistry(manifest);

// Generate client hooks
const hooks = generateClientHooks(registry);
```
