# Plugin Runtime Architecture

> **Status**: Active (Updated 2025-12-12)
> **Version**: V2 (Unified Context Architecture)

## Overview

KB Labs Plugin Runtime provides a unified execution environment for plugins across multiple adapters (CLI, REST, Workflow, Jobs). This document describes the **V2 architecture** after the migration from dual-context system to unified `PluginContextV2`.

## Table of Contents

- [High-Level Architecture](#high-level-architecture)
- [Context Flow](#context-flow)
- [Adapter Types](#adapter-types)
- [Execution Pipeline](#execution-pipeline)
- [Context Structure](#context-structure)
- [Migration Status](#migration-status)
- [Examples](#examples)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          ADAPTER LAYER                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   CLI    │  │   REST   │  │ Workflow │  │  Invoke  │       │
│  │ Adapter  │  │ Adapter  │  │ Adapter  │  │  Broker  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │              │              │              │
│       └─────────────┼──────────────┼──────────────┘              │
│                     │              │                             │
│                     ▼              ▼                             │
│         ┌────────────────────────────────────────┐              │
│         │ createPluginContextWithPlatform()      │              │
│         │   ↓                                    │              │
│         │ PluginContextV2 (unified context)      │              │
│         └────────────────────────────────────────┘              │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       EXECUTION LAYER                            │
│         ┌────────────────────────────────────────┐              │
│         │ executePlugin()                        │              │
│         │   1. checkCapabilities()               │              │
│         │   2. validateInput()                   │              │
│         │   3. loadHandler()                     │              │
│         │   4. handler(context, argv, flags)     │              │
│         │   5. validateOutput()                  │              │
│         │   6. writeArtifacts()                  │              │
│         └────────────────────────────────────────┘              │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        HANDLER LAYER                             │
│  export async function handler(                                 │
│    ctx: PluginContextV2,                                        │
│    argv: string[],                                              │
│    flags: Record<string, unknown>                               │
│  ): Promise<CommandResult> {                                    │
│    // Handler implementation                                    │
│    ctx.runtime.fs.readFile(...)                                │
│    ctx.runtime.state.get(...)                                  │
│    ctx.platform.llm.chat(...)                                  │
│    return { ok: true, data: {...} }                            │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Context Flow

### Before: Dual Context System (DEPRECATED)

```
Adapter
  ↓
createExecutionContext()
  ↓
ExecutionContext {
  requestId, pluginId, pluginVersion,
  workdir, outdir, pluginRoot,           ← buried fields
  adapterContext: {...},                 ← adapter-specific
  adapterMeta: {...},                    ← adapter-specific
  pluginContext?: PluginContext          ← optional wrapper
}
  ↓
execute(ExecuteInput, ExecutionContext)
  ↓
buildExecutionContext()  ← adds brokers, chain limits
  ↓
SandboxRunner.run()
  ↓
PluginHandlerContext {                   ← different type!
  type, requestId, workdir, outdir,
  flags, argv, output, presenter,
  extensions: { fs, invoke, ... }        ← scattered APIs
}
  ↓
handler(ctx: PluginHandlerContext)
```

**Problems:**
- ❌ 2 different context types
- ❌ 5 layers of transformation
- ❌ `cwd`/`outdir` buried in `ExecutionContext.workdir/outdir`
- ❌ Adapter-specific fields in `adapterContext`/`adapterMeta`
- ❌ Inconsistent API surface (`extensions.*` vs `runtime.*`)

---

### After: Unified Context System (CURRENT)

```
Adapter
  ↓
createPluginContextWithPlatform({
  host: 'cli' | 'rest' | 'workflow',
  requestId, pluginId, pluginVersion,
  cwd,                                   ← promoted!
  outdir,                                ← promoted!
  config, ui,
  metadata: { ...adapter-specific }      ← only what's needed
})
  ↓
PluginContextV2 {
  host, requestId, pluginId, pluginVersion,
  cwd, outdir,                           ← top-level!
  config, ui,
  runtime: { fs, config, state, invoke }, ← unified!
  platform: { llm, vectorStore, ... },   ← new!
  metadata: { ...adapter-specific }
}
  ↓
executePlugin(ExecutePluginOptions)
  ↓
handler(ctx: PluginContextV2, argv, flags)
```

**Benefits:**
- ✅ Single unified context type
- ✅ 2 layers only (adapter → handler)
- ✅ `cwd`/`outdir` at top-level
- ✅ Clean `metadata` for adapter-specific fields
- ✅ Consistent `runtime.*` API

---

## Adapter Types

### 1. CLI Adapter

**Location**: `packages/plugin-adapters/cli/src/handler.ts`

**Flow**:
```typescript
CLI Command
  ↓
createPluginContextWithPlatform({
  host: 'cli',
  cwd: workdir,
  outdir,
  metadata: { flags, argv, jsonMode, debug }
})
  ↓
executePlugin({ context, handlerRef, argv, flags, ... })
  ↓
handler(ctx, argv, flags)
```

**Metadata Fields**:
- `flags: Record<string, unknown>` - Parsed command flags
- `argv: string[]` - Positional arguments
- `jsonMode: boolean` - JSON output mode
- `debug: boolean` - Debug mode enabled

---

### 2. REST Adapter

**Location**: `packages/plugin-adapters/rest/src/handler.ts`

**Flow**:
```typescript
HTTP Request
  ↓
createPluginContextWithPlatform({
  host: 'rest',
  cwd: defaultWorkdir,
  outdir: defaultOutdir,
  metadata: { method, path, basePath, traceId, headers, request }
})
  ↓
executePlugin({ context, handlerRef, flags: requestBody, ... })
  ↓
handler(ctx, [], flags)  // No argv for REST
```

**Metadata Fields**:
- `method: string` - HTTP method (GET, POST, etc.)
- `path: string` - Route path
- `basePath: string` - Base path prefix
- `traceId: string` - Distributed tracing ID
- `headers: { inbound, sensitive, rateLimitKeys }` - HTTP headers
- `request: FastifyRequest` - Full Fastify request object

**Result Format**:
```typescript
{
  ok: boolean,
  data?: unknown,
  metrics: { timeMs: number },
  error?: { status, http, code, message, meta }
}
```

---

### 3. Workflow Adapter

**Location**: `kb-labs-workflow/packages/workflow-engine/src/job-handler.ts`

**Flow**:
```typescript
Workflow Step (plugin type)
  ↓
createPluginContextWithPlatform({
  host: 'workflow',
  cwd: workspace,
  outdir: workspace,
  metadata: { runId, jobId, stepId, attempt, traceId, spanId }
})
  ↓
executePlugin({ context, handlerRef, argv, flags: spec.with, ... })
  ↓
handler(ctx, argv, flags)
```

**Metadata Fields**:
- `runId: string` - Workflow run ID
- `jobId: string` - Job ID within workflow
- `stepId: string` - Step ID within job
- `attempt: number` - Retry attempt number
- `traceId: string` - Distributed tracing ID
- `spanId: string` - Span ID for tracing
- `parentSpanId: string` - Parent span ID

**Result Format**:
```typescript
{
  status: 'success' | 'failed',
  outputs?: {
    data: unknown,           // Handler result data
    metrics: { timeMs },     // Execution metrics
    logs: string[],          // Execution logs
    profile: unknown,        // Performance profile
    stepId: string          // Step identifier
  },
  error?: { code, message }
}
```

**Important**: Workflow wraps handler result in `outputs` to maintain compatibility with workflow expressions (e.g., `steps.my_step.outputs.data.count`).

---

### 4. Invoke Broker (TODO)

**Location**: `packages/plugin-runtime/src/invoke/broker.ts`

**Status**: ⏳ Pending migration

**Planned Flow**:
```typescript
Cross-plugin invocation
  ↓
createPluginContextWithPlatform({
  host: 'invoke',  // or inherit from caller
  cwd: workdir,
  outdir,
  metadata: { traceId, spanId, chainDepth, remainingMs }
})
  ↓
executePlugin({ context, handlerRef, flags: input, ... })
  ↓
handler(ctx, [], flags)
```

---

### 5. Jobs Manager (TODO)

**Location**: `kb-labs-core/packages/core-state-daemon/src/jobs-manager.ts`

**Status**: ⏳ Pending migration

**Planned Flow**:
```typescript
Scheduled Job
  ↓
createPluginContextWithPlatform({
  host: 'cli',  // Scheduled jobs are CLI-like
  cwd: process.cwd(),
  outdir: '.kb/...',
  metadata: { jobId, schedule, scheduledJob: true }
})
  ↓
executePlugin({ context, handlerRef, argv: [], flags: {}, ... })
  ↓
handler(ctx, [], {})
```

---

## Execution Pipeline

### executePlugin() Steps

**Location**: `packages/plugin-runtime/src/execute-plugin/index.ts`

```typescript
export async function executePlugin(
  options: ExecutePluginOptions
): Promise<ExecutePluginResult>
```

**Pipeline**:

```
1. ✓ Check Capabilities
   ├─ Required capabilities vs granted
   └─ Return error if missing

2. ✓ Validate Input (flags)
   ├─ Schema validation (if manifest.input exists)
   └─ Return error if invalid

3. ✓ Load Handler
   ├─ Parse handler reference (file#export)
   ├─ Resolve handler file path
   ├─ Add .js extension if missing (ESM requirement)
   ├─ Convert to file:// URL
   └─ Dynamic import

4. ✓ Execute Handler
   ├─ Call handler(context, argv, flags)
   ├─ Await result
   └─ Catch errors

5. ✓ Validate Output
   ├─ Schema validation (if manifest.output exists)
   └─ Return error if invalid

6. ✓ Write Artifacts
   ├─ Write files to outdir
   └─ Track artifact paths

7. ✓ Return Result
   └─ { ok, data?, error?, metrics }
```

---

## Context Structure

### PluginContextV2

**Location**: `packages/plugin-runtime/src/context/plugin-context-v2.ts`

```typescript
interface PluginContextV2 {
  // Identity
  host: 'cli' | 'rest' | 'workflow' | 'invoke' | 'daemon';
  requestId: string;
  pluginId: string;
  pluginVersion: string;
  tenantId?: string;

  // Filesystem (promoted to top-level!)
  cwd: string;           // Current working directory
  outdir: string;        // Output directory for artifacts

  // Configuration
  config: Record<string, unknown>;

  // User Interface
  ui: IPresenter;

  // Platform Services (AI, Vector DB, etc.)
  platform: {
    llm: ILLMService;
    vectorStore: IVectorStoreService;
    embeddings: IEmbeddingsService;
    events?: IEventBus;
  };

  // Runtime APIs (filesystem, state, config, invoke)
  runtime: {
    fs: IFileSystemAPI;
    config: IConfigAPI;
    state: IStateBroker;
    invoke: IInvokeBroker;
  };

  // Adapter-specific metadata
  metadata: Record<string, unknown>;
}
```

### Metadata by Adapter

**CLI**:
```typescript
metadata: {
  flags: Record<string, unknown>,
  argv: string[],
  jsonMode: boolean,
  debug: boolean,
  pluginRoot: string
}
```

**REST**:
```typescript
metadata: {
  method: string,
  path: string,
  basePath: string,
  traceId: string,
  headers: {
    inbound: Record<string, string>,
    sensitive?: string[],
    rateLimitKeys?: Record<string, string>
  },
  request: FastifyRequest
}
```

**Workflow**:
```typescript
metadata: {
  runId: string,
  jobId: string,
  stepId: string,
  attempt: number,
  traceId: string,
  spanId?: string,
  parentSpanId?: string,
  getTrackedOperations: () => Operation[]
}
```

**Invoke**:
```typescript
metadata: {
  traceId: string,
  spanId?: string,
  parentSpanId?: string,
  chainDepth: number,
  remainingMs: () => number
}
```

---

## Migration Status

### ✅ Completed

- **CLI Adapter** (Phase 0) - `packages/plugin-adapters/cli/src/handler.ts`
- **REST Adapter** (Phase 1) - `packages/plugin-adapters/rest/src/handler.ts`
- **Workflow Adapter** (Phase 2) - `kb-labs-workflow/packages/workflow-engine/src/job-handler.ts`

### ⏳ Pending

- **Invoke Broker** (Phase 3) - `packages/plugin-runtime/src/invoke/broker.ts`
- **Jobs Manager** (Phase 4) - `kb-labs-core/packages/core-state-daemon/src/jobs-manager.ts`
- **Cleanup** (Phase 5) - Remove old `execute()`, `ExecutionContext`, `context-builder.ts`

---

## Examples

### Example 1: CLI Plugin Handler

```typescript
// packages/my-plugin/src/cli/commands/hello.ts
import type { PluginContextV2 } from '@kb-labs/plugin-runtime';

export async function run(
  ctx: PluginContextV2,
  argv: string[],
  flags: { name?: string; json?: boolean }
) {
  const name = flags.name || 'World';

  // Access top-level fields
  const cwd = ctx.cwd;
  const outdir = ctx.outdir;

  // Use runtime APIs
  const fileContent = await ctx.runtime.fs.readFile('config.json');
  const cacheValue = await ctx.runtime.state.get('cache-key');

  // Use platform services
  const llmResponse = await ctx.platform.llm.chat('Hello!');

  // Use UI presenter
  ctx.ui.message(`Hello, ${name}!`);

  return { ok: true, data: { greeting: `Hello, ${name}!` } };
}
```

### Example 2: REST Plugin Handler

```typescript
// packages/my-plugin/src/rest/handlers/review.ts
import type { PluginContextV2 } from '@kb-labs/plugin-runtime';

export async function handle(
  ctx: PluginContextV2,
  argv: string[],  // Empty for REST
  flags: { code: string }
) {
  // Access REST-specific metadata
  const method = ctx.metadata.method;
  const path = ctx.metadata.path;
  const headers = ctx.metadata.headers;

  // Perform review
  const review = await ctx.platform.llm.chat(`Review this code: ${flags.code}`);

  return {
    ok: true,
    data: {
      review,
      method,
      path,
    }
  };
}
```

### Example 3: Workflow Plugin Handler

```typescript
// packages/my-plugin/src/cli/commands/process.ts
import type { PluginContextV2 } from '@kb-labs/plugin-runtime';

export async function run(
  ctx: PluginContextV2,
  argv: string[],
  flags: { input: string }
) {
  // Access workflow metadata
  const runId = ctx.metadata.runId;
  const stepId = ctx.metadata.stepId;

  // Process input
  const result = await processData(flags.input);

  // Return data (will be wrapped in outputs.data by workflow adapter)
  return {
    ok: true,
    data: {
      processed: result,
      count: result.length,
    }
  };
}

// In workflow YAML:
// steps:
//   - name: process
//     uses: plugin:my-plugin:process
//     with:
//       input: ${{ inputs.data }}
//
// Access output:
// ${{ steps.process.outputs.data.count }}
```

---

## Key Design Decisions

### 1. Single Context Type

**Decision**: Use `PluginContextV2` everywhere, instead of dual `ExecutionContext` + `PluginHandlerContext`.

**Rationale**:
- Eliminates transformation layers
- Reduces cognitive overhead
- Makes debugging easier
- Cleaner type system

### 2. Promoted Fields

**Decision**: Promote `cwd` and `outdir` to top-level context.

**Rationale**:
- These are universal across all adapters
- Handlers need them frequently
- Reduces nesting (`ctx.cwd` vs `ctx.metadata.workdir`)

### 3. Runtime Consolidation

**Decision**: Consolidate APIs under `ctx.runtime.*` instead of scattered `extensions.*`.

**Rationale**:
- Consistent API surface
- Easy to discover
- Clear separation from platform services

### 4. Platform Services

**Decision**: Add `ctx.platform.*` for AI/ML services.

**Rationale**:
- Growing need for LLM/embeddings/vector stores
- Separate from runtime (filesystem/config/state)
- Future-proof for more platform services

### 5. Metadata for Adapter-Specific

**Decision**: Use `metadata` object for adapter-specific fields instead of custom wrapper objects.

**Rationale**:
- Avoids type proliferation
- Clear boundary: universal fields at top-level, adapter-specific in metadata
- Easy to extend per adapter

---

## Related Documentation

- [Migration Plan](/.claude/plans/mutable-tickling-pinwheel.md) - Full migration plan from V1 to V2
- [Plugin Manifest V2](../plugin-manifest/README.md) - Manifest schema
- [Execute Plugin](./packages/plugin-runtime/src/execute-plugin/README.md) - Execution pipeline
- [Context Types](./packages/plugin-runtime/src/context/README.md) - Context type definitions

---

**Last Updated**: 2025-12-12
**Authors**: KB Labs Team
**Status**: Living Document
