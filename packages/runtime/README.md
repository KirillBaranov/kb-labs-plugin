# @kb-labs/plugin-runtime

Plugin runtime execution engine with capabilities, permissions, quota management, and analytics integration.

## Features

- Capability-based security checks
- Permission validation (fs, net, env, quotas)
- Handler execution wrapper with validation
- Artifact writing with path templating
- Analytics integration via @kb-labs/analytics-sdk-node

## Usage

```typescript
import { execute, checkCapabilities, createPluginContext } from '@kb-labs/plugin-runtime';

// Execute handler with full runtime support
const result = await execute(
  './handlers/review.js#handle',
  input,
  context,
  manifest
);
```
