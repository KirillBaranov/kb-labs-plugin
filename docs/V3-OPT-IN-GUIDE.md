# V3 Plugin System - Opt-In Guide

**Date:** 2025-12-17
**Status:** Experimental
**Target Audience:** Plugin Developers

## Overview

The V3 plugin system is a next-generation plugin architecture with:

- **Clean separation** from V2 runtime
- **Subprocess isolation** for security and stability
- **Modern SDK** with lifecycle hooks, tracing, and runtime APIs
- **Opt-in mechanism** via environment variable

This guide explains how to enable and use V3 in your plugins.

## Quick Start

### 1. Enable V3 Execution

Set the environment variable before running any command:

```bash
KB_PLUGIN_VERSION=3 pnpm kb your-plugin:command
```

### 2. Create V3 Command

In your plugin, create a V3 command using `@kb-labs/sdk-v3`:

```typescript
// src/cli/commands/my-command-v3.ts
import { defineCommand } from '@kb-labs/sdk-v3';
import type { PluginContextV3, CommandResult } from '@kb-labs/plugin-contracts-v3';

export interface MyCommandFlags {
  name?: string;
}

export interface MyCommandInput {
  argv: string[];
  flags: MyCommandFlags;
}

export default defineCommand<unknown, MyCommandInput>({
  id: 'my-command-v3',
  description: 'V3 version of my command',

  handler: {
    async execute(
      ctx: PluginContextV3<unknown>,
      input: MyCommandInput
    ): Promise<CommandResult> {
      const name = input.flags.name ?? 'World';

      // Use V3 runtime APIs
      ctx.trace.addEvent('start', { name });
      ctx.ui.success(`Hello, ${name}!`);

      // Access filesystem (if permitted)
      const exists = await ctx.runtime.fs.exists(ctx.cwd);
      ctx.ui.info(`CWD exists: ${exists}`);

      // Register cleanup
      ctx.api.lifecycle.onCleanup(async () => {
        ctx.ui.info('Cleanup called');
      });

      return { exitCode: 0 };
    },
  },
});
```

### 3. Register V3 Command in Manifest

Add the V3 command to your `manifest.v2.ts`:

```typescript
// src/manifest.v2.ts
import { defineManifestV2 } from '@kb-labs/plugin-manifest';

export default defineManifestV2({
  // ... other manifest fields
  cli: {
    commands: [
      {
        id: 'my-plugin:my-command-v3',
        group: 'my-plugin',
        describe: 'V3 version of my command',
        flags: defineCommandFlags({
          name: {
            type: 'string',
            description: 'Name to greet',
            default: 'World',
            alias: 'n',
          },
        }),
        handler: './cli/commands/my-command-v3.js#default',
        handlerPath: './cli/commands/my-command-v3.js',  // V3-specific
        permissions: {
          fs: { read: ['./'] },  // Grant filesystem access
          quotas: {
            timeoutMs: 5000,
            memoryMb: 64,
          },
        },
      },
    ],
  },
});
```

### 4. Build and Test

```bash
# Build your plugin
pnpm --filter @kb-labs/my-plugin run build

# Clear CLI cache
pnpm kb plugins clear-cache

# Test V3 command
KB_PLUGIN_VERSION=3 pnpm kb my-plugin:my-command-v3 --name="Developer"
```

## V3 vs V2 Comparison

| Feature | V2 | V3 |
|---------|----|----|
| **Execution** | In-process | Subprocess (fork) |
| **Context** | `PluginContextV2` | `PluginContextV3` |
| **SDK** | `@kb-labs/sdk` | `@kb-labs/sdk-v3` |
| **Manifest field** | `handler` | `handler` + `handlerPath` |
| **Isolation** | None | Full subprocess isolation |
| **Lifecycle** | Limited | Rich lifecycle hooks |
| **Tracing** | Manual | Built-in via `ctx.trace` |
| **Runtime APIs** | Via adapters | Via `ctx.runtime.*` |
| **Opt-in** | Default | `KB_PLUGIN_VERSION=3` |

## V3 Context API

The V3 context provides rich APIs:

### Plugin Metadata
```typescript
ctx.pluginId       // '@kb-labs/my-plugin'
ctx.pluginVersion  // '1.0.0'
ctx.cwd            // '/path/to/workspace'
ctx.outdir         // Optional output directory
ctx.tenantId       // Optional tenant ID
```

### UI Output
```typescript
ctx.ui.info('Info message')
ctx.ui.success('Success message')
ctx.ui.warn('Warning message')
ctx.ui.error('Error message')
ctx.ui.debug('Debug message')
```

### Tracing
```typescript
ctx.trace.addEvent('event-name', { key: 'value' })
ctx.trace.setStatus('ok' | 'error')
```

### Runtime APIs
```typescript
// Filesystem (requires permissions)
await ctx.runtime.fs.readFile('/path/to/file')
await ctx.runtime.fs.writeFile('/path/to/file', 'content')
await ctx.runtime.fs.exists('/path/to/file')
await ctx.runtime.fs.readDir('/path/to/dir')

// State (in-memory cache)
await ctx.runtime.state.get('key')
await ctx.runtime.state.set('key', value, ttlMs)
await ctx.runtime.state.delete('key')
```

### Lifecycle Hooks
```typescript
// Register cleanup callback
ctx.api.lifecycle.onCleanup(async () => {
  // Cleanup logic (e.g., close connections, delete temp files)
});

// Check if cleanup requested
if (ctx.api.lifecycle.isCleanupRequested()) {
  // Early exit
}
```

### Output API
```typescript
// Structured result
ctx.api.output.result({ message: 'Success', code: 0 });

// Metadata
ctx.api.output.meta('key', 'value');

// Artifacts
ctx.api.output.artifact('/path/to/file', 'text/plain');
```

### Abort Signal
```typescript
if (ctx.signal) {
  ctx.signal.addEventListener('abort', () => {
    ctx.ui.warn('Command aborted');
    // Cleanup and exit
  });
}
```

## Permissions Model

V3 enforces strict permissions. Declare required permissions in manifest:

```typescript
permissions: {
  fs: {
    read: ['./'],           // Read access to workspace
    write: ['./output'],    // Write access to output dir
  },
  net: {
    allowedDomains: ['api.example.com'], // Allowed HTTP domains
  },
  quotas: {
    timeoutMs: 10000,       // Max execution time
    memoryMb: 128,          // Max memory usage
    cpuMs: 5000,            // Max CPU time
  },
}
```

## Migration from V2

### 1. Keep V2 Command
Don't delete your V2 command - it's the fallback when `KB_PLUGIN_VERSION=3` is not set.

### 2. Create V3 Variant
Create a new file with `-v3` suffix:
- `my-command.ts` → `my-command-v3.ts`

### 3. Adapt Context Usage
```typescript
// V2
export async function run(ctx: PluginContextV2, argv: string[], flags: Flags) {
  console.log('Hello');
  return 0;
}

// V3
export default defineCommand<unknown, Input>({
  handler: {
    async execute(ctx: PluginContextV3<unknown>, input: Input): Promise<CommandResult> {
      ctx.ui.info('Hello');  // Use ctx.ui instead of console
      return { exitCode: 0 };
    },
  },
});
```

### 4. Update Manifest
Add `handlerPath` field for V3 command:

```typescript
{
  handler: './cli/commands/my-command-v3.js#default',
  handlerPath: './cli/commands/my-command-v3.js',  // Required for V3
}
```

## Current Limitations

⚠️ **V3 is experimental. Known limitations:**

1. **Subprocess overhead**: ~50-100ms startup time (fork + IPC setup)
2. **No IPC communication yet**: Phase 6 feature (UnixSocket/HTTP IPC)
3. **Limited runtime APIs**: Only fs, state, git available
4. **Dev mode only**: Production uses subprocess, dev can use in-process
5. **No streaming output**: Buffered output only

## Troubleshooting

### Command not found
```bash
# Clear cache
pnpm kb plugins clear-cache

# Verify command registered
pnpm kb plugins commands | grep my-command-v3
```

### Module resolution errors
```bash
# Rebuild plugin
pnpm --filter @kb-labs/my-plugin run build

# Check handlerPath points to dist/
ls -la packages/my-plugin/dist/cli/commands/my-command-v3.js
```

### Bootstrap not found
```bash
# Rebuild cli-bin (copies bootstrap.js)
pnpm --filter @kb-labs/cli-bin run build

# Verify bootstrap exists
ls -la kb-labs-cli/packages/cli-bin/dist/bootstrap.js
```

### Permission denied
Add required permissions to manifest:
```typescript
permissions: {
  fs: { read: ['./'] },  // Example: grant fs.read
}
```

## How It Works

### Execution Flow

1. **CLI parses command**: `pnpm kb my-plugin:my-command-v3`
2. **Check KB_PLUGIN_VERSION**: If `3`, use V3 adapter
3. **V3 adapter extracts handlerPath**: From `manifestV2.cli.commands`
4. **Fork subprocess**: `fork(bootstrap.js)` with IPC channel
5. **Bootstrap loads handler**: Dynamically imports handler from plugin
6. **Execute handler**: Calls `handler.execute(ctx, input)`
7. **Return result**: Exit code sent back to parent via IPC

### Bootstrap Resolution

Bootstrap.js is found via multi-location fallback:

1. **Production**: `cli-bin/dist/bootstrap.js` (copied during build)
2. **Development**: `plugin-runtime-v3/dist/sandbox/bootstrap.js`
3. **Fallback**: `process.cwd()/dist/bootstrap.js`

See [ADR-0016: Standalone Bootstrap](./adr/0016-standalone-bootstrap-for-subprocess-execution.md) for details.

## Examples

See working V3 command:
- [plugin-template hello-v3](../../kb-labs-plugin-template/packages/plugin-template-core/src/cli/commands/hello-v3.ts)
- [plugin-template manifest](../../kb-labs-plugin-template/packages/plugin-template-core/src/manifest.v2.ts)

## Next Steps

1. **Try it**: Enable V3 for your commands
2. **Give feedback**: Report issues or suggestions
3. **Migrate gradually**: Start with simple commands
4. **Prepare for Phase 6**: IPC communication (UnixSocket/HTTP)

## References

- [ADR-0010: Sandbox Execution Model](./adr/0010-sandbox-execution-model.md)
- [ADR-0015: Execution Adapters](./adr/0015-execution-adapters.md)
- [ADR-0016: Standalone Bootstrap](./adr/0016-standalone-bootstrap-for-subprocess-execution.md)
- [Plugin Contracts V3](../../kb-labs-plugin/packages/plugin-contracts-v3/)
- [Plugin Runtime V3](../../kb-labs-plugin/packages/plugin-runtime-v3/)
- [SDK V3](../../kb-labs-sdk/packages/sdk-v3/)

---

**Last Updated:** 2025-12-17
**Status:** Experimental - Feedback Welcome!
