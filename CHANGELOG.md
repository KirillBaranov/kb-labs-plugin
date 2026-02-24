# Changelog — @kb-labs/plugin

## 1.0.0 — 2026-02-24

First stable release. Prior history represents internal R&D — this is the first versioned public release.

### Packages

| Package | Version |
|---------|---------|
| `@kb-labs/plugin-contracts` | 1.0.0 |
| `@kb-labs/plugin-runtime` | 1.0.0 |
| `@kb-labs/plugin-execution` | 1.0.0 |
| `@kb-labs/plugin-execution-factory` | 1.0.0 |

### What's included

**`@kb-labs/plugin-contracts`** — Pure TypeScript contracts for the v3 plugin system. Zero runtime dependencies. Defines:
- `PluginContextV3` — full plugin execution context
- Host contexts: `CliHostContext`, `RestHostContext`, `WorkflowHostContext`, `WebhookHostContext`, `CronHostContext`, `WebSocketHostContext`
- `PermissionSpec` — plugin permission declarations
- Plugin manifest types and validation schemas

**`@kb-labs/plugin-runtime`** — v3 plugin runtime. Context factory, sandboxed platform shims, bootstrap sequence. Handles plugin lifecycle: load → validate → execute → teardown.

**`@kb-labs/plugin-execution`** — Universal execution layer supporting in-process, subprocess, and worker-pool backends. Re-exports from `plugin-execution-factory` for backward compatibility.

**`@kb-labs/plugin-execution-factory`** — Execution backend factories extracted into a separate package to break the circular dependency between `plugin-runtime` and `core-runtime`. Supports:
- In-process execution
- Subprocess isolation
- Worker-pool execution

### Architecture

```
plugin-contracts  (pure types)
       ↓
plugin-execution-factory  →  core-runtime
       ↓
plugin-execution  (re-exports)
       ↓
plugin-runtime  (bootstrap, context factory)
```

Circular dependency `core-runtime ↔ plugin-runtime` is resolved by `plugin-execution-factory` and dynamic import in plugin bootstrap.

### Notes

- Always use `plugin-contracts` for type imports — do not import from `plugin-runtime` in contracts packages
- `plugin-execution-factory` is an internal package; prefer `plugin-execution` as the public API
- Sandbox isolation is enforced for subprocess and worker-pool backends
