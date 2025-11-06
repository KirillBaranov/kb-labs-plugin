# @kb-labs/plugin-adapter-rest

REST API adapter for Plugin Model v2 - maps manifest REST routes to Fastify routes with OpenAPI generation.

## Features

- Dynamic route mounting from manifest
- Zod input/output validation
- OpenAPI spec generation
- Error mapping to ErrorEnvelope
- Security schemes support

## Usage

```typescript
import { mountRoutes, generateOpenAPI } from '@kb-labs/plugin-adapter-rest';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

// Mount routes from manifest
await mountRoutes(app, manifest, runtime);

// Generate OpenAPI spec
const openapi = generateOpenAPI(manifest);
```
