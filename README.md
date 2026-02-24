# KB Labs Plugin System (@kb-labs/plugin)

> **Plugin system infrastructure for KB Labs ecosystem.** Manifest definitions, sandboxed runtime, and execution backends for CLI, REST, and Workflow adapters.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision

KB Labs Plugin System provides the infrastructure for creating, managing, and executing plugins across the KB Labs ecosystem. It defines the plugin manifest format (V3), provides a sandboxed runtime execution engine, and supplies execution backends for CLI, REST API, and Workflow adapters.

This project is the foundation for all plugin development in the **@kb-labs** ecosystem.

## 🚀 Quick Start

```bash
# From KB Labs monorepo root
cd kb-labs-plugin
pnpm install
pnpm build
pnpm test
```

## 📁 Repository Structure

```
kb-labs-plugin/
├── packages/
│   ├── plugin-contracts/          # Pure types and interfaces (0 runtime deps)
│   ├── plugin-runtime/            # Context factory, sandboxed execution, runtime APIs
│   ├── plugin-execution-factory/  # Execution backends (in-process, subprocess, worker-pool)
│   └── plugin-execution/          # Re-exports from execution-factory (backward compat)
└── docs/                          # Documentation and ADRs
```

## 📦 Packages

| Package | Description |
|---------|-------------|
| [@kb-labs/plugin-contracts](./packages/plugin-contracts/) | Pure TypeScript types and interfaces — 0 runtime dependencies |
| [@kb-labs/plugin-runtime](./packages/plugin-runtime/) | Context factory (`PluginContextV3`), sandboxed execution, runtime shims (fs, fetch, env) |
| [@kb-labs/plugin-execution-factory](./packages/plugin-execution-factory/) | Execution backends: `InProcessBackend`, `SubprocessBackend`, `WorkerPoolBackend` |
| [@kb-labs/plugin-execution](./packages/plugin-execution/) | Re-exports from `plugin-execution-factory` for backward compatibility |

## 🏗️ Architecture

### Plugin Manifest (V3)

Plugins declare capabilities via `manifest.ts` using `defineManifest`:

```typescript
import { defineManifest } from '@kb-labs/sdk';

export default defineManifest({
  schema: 'kb.plugin/3',
  id: '@acme/my-plugin',
  version: '1.0.0',
  permissions: combine(minimal, llmAccess),
  cli: {
    commands: [{ id: 'greet', handler: './cli/greet.js#run' }]
  },
});
```

### Plugin Context (V3)

Handlers receive a unified `PluginContextV3`:

```typescript
export async function run(ctx, input) {
  ctx.ui.info('Starting...');
  const file = await ctx.runtime.fs.readFile('config.json');
  const reply = await ctx.platform.llm.generate({ prompt: 'Hello' });
  return { exitCode: 0, result: { reply } };
}
```

Context structure:
- `ctx.host` — `'cli' | 'rest' | 'workflow'`
- `ctx.cwd` / `ctx.outdir` — working directories
- `ctx.ui` — 13 output methods (info, warn, table, spinner, etc.)
- `ctx.runtime.fs` — sandboxed filesystem (17 methods)
- `ctx.runtime.fetch` — sandboxed network
- `ctx.runtime.env` — sandboxed env vars
- `ctx.platform` — LLM, embeddings, vector store, cache, analytics
- `ctx.api` — lifecycle, state

### Execution Backends

`plugin-execution-factory` provides three backends:

```typescript
import { createExecutionBackend } from '@kb-labs/plugin-execution-factory';

// Fast, no isolation (dev mode)
const backend = createExecutionBackend({ type: 'in-process' });

// Isolated subprocess via IPC (production)
const backend = createExecutionBackend({ type: 'subprocess' });

// Pool of workers for parallel execution
const backend = createExecutionBackend({
  type: 'worker-pool',
  options: { minWorkers: 2, maxWorkers: 10 }
});
```

### Circular Dependency Resolution

`plugin-execution-factory` was extracted to eliminate a circular dependency:

```
Before: core-runtime → plugin-execution → plugin-runtime → core-runtime ❌
After:  plugin-runtime → plugin-execution-factory → core-runtime ✅
```

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all code |
| `pnpm type-check` | TypeScript type checking |

## 📋 Requirements

- **Node.js**: >= 18.18.0
- **pnpm**: >= 9.0.0

## 📚 Documentation

- [Architecture](./ARCHITECTURE.md) — Runtime V2 context flow and adapter types
- [Plugin Contracts](./packages/plugin-contracts/README.md) — Type definitions
- [Plugin Runtime](./packages/plugin-runtime/README.md) — Context factory and sandbox
- [Execution Factory](./packages/plugin-execution-factory/README.md) — Execution backends
- [Architecture Decisions](./docs/adr/) — ADRs for this project

## 🔗 Related Packages

**Dependencies:**
- [@kb-labs/core-platform](https://github.com/KirillBaranov/kb-labs-core) — Platform adapters (LLM, cache, etc.)
- [@kb-labs/core-ipc](https://github.com/KirillBaranov/kb-labs-core) — IPC transport for subprocess execution

**Used By:**
- [kb-labs-cli](https://github.com/KirillBaranov/kb-labs-cli) — CLI implementation
- [kb-labs-rest-api](https://github.com/KirillBaranov/kb-labs-rest-api) — REST API plugin mounting
- [kb-labs-workflow](https://github.com/KirillBaranov/kb-labs-workflow) — Workflow step execution

**Ecosystem:**
- [KB Labs](https://github.com/KirillBaranov/kb-labs) — Main ecosystem repository

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.

## 📄 License

KB Public License v1.1 © KB Labs

---

**See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines and contribution process.**
