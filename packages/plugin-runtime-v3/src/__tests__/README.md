# Plugin Runtime V3 Tests

## Test Suite Overview

This test suite ensures the **core stability** of the V3 plugin system. These tests prevent API drift and verify critical execution paths.

### Test Files

1. **context-factory.test.ts** - Context factory unit tests
2. **context-structure.test.ts** - Runtime structure integration tests
3. **sandbox-runner.test.ts** - Execution runner tests
4. **e2e-context.test.ts** - End-to-end CLI tests

## Context Factory Tests

**File:** `context-factory.test.ts`

Unit tests for `createPluginContextV3` - the **critical factory** that creates every plugin context.

### What It Tests

- ✅ All required context fields are present
- ✅ Runtime API correctly wired (17 FS methods)
- ✅ Plugin API correctly wired (lifecycle, output, state, etc.)
- ✅ Cleanup stack creation
- ✅ Signal propagation
- ✅ Optional fields preservation (tenantId, outdir, config)
- ✅ Unique requestId generation
- ✅ Trace context creation (traceId, spanId)

**Why Critical:** If createPluginContextV3 breaks, **ALL V3 plugins fail**.

## Context Structure Tests

**File:** `context-structure.test.ts`

Integration tests that verify the **actual runtime structure** of `PluginContextV3` passed to plugin handlers.

### Why These Tests Exist

These tests prevent **API drift** between:
- Type definitions (`PluginContextV3` interface)
- Runtime implementation (`createPluginContextV3`)
- Plugin handler expectations

### What They Test

**1. Complete Structure Test**
- Verifies all top-level context keys are present
- Validates metadata fields (host, pluginId, etc.)
- Checks all services are provided:
  - UI facade (13 methods)
  - Platform services (7 services)
  - Runtime API (fs, fetch, env)
  - Plugin API (lifecycle, output, state, etc.)
- Ensures 17 FS methods are available
- Verifies signal presence

**2. Snapshot Test**
- Creates **immutable snapshots** of the API surface
- Will **fail** if any method is added/removed
- Documents the exact API structure

### Running Tests

```bash
# Run all tests
pnpm test

# Watch mode (useful during development)
pnpm test:watch

# Run specific test file
pnpm vitest run src/__tests__/context-structure.test.ts
```

### When Tests Fail

**If the snapshot test fails:**

1. **Intentional API change?**
   - Review the diff carefully
   - Update snapshot: `pnpm vitest -u`
   - Document breaking change in CHANGELOG

2. **Accidental regression?**
   - Fix the implementation to match the snapshot
   - Do NOT update snapshot unless API change is intentional

**If the structure test fails:**

1. Check error message - it will tell you what's missing/wrong
2. Fix the `createPluginContextV3` implementation
3. Ensure all required services are provided

### Updating Snapshots

```bash
# Update all snapshots
pnpm vitest -u

# Update specific test
pnpm vitest -u context-structure.test.ts
```

**⚠️ Warning:** Only update snapshots for **intentional API changes**. Always review the diff first.

### Test Coverage

These tests ensure:
- ✅ No accidental API removals
- ✅ New features don't break existing API
- ✅ Type definitions match runtime
- ✅ All services are wired correctly
- ✅ Platform, UI, Runtime APIs are accessible

## Sandbox Runner Tests

**File:** `sandbox-runner.test.ts`

Tests for `runInProcess` and `runInSubprocess` - the **execution entry points** for all V3 plugins.

### What It Tests

**runInProcess (8 tests):**
- ✅ Successful handler execution with result
- ✅ Handler returning void
- ✅ Invalid handler detection (missing execute function)
- ✅ Cleanup execution after success
- ✅ Cleanup execution after error (LIFO order)
- ✅ Signal propagation to context
- ✅ Default export vs named export handling
- ✅ Complete context provided to handler

**runInSubprocess (4 todo for Phase 6):**
- ⏳ Subprocess execution with IPC
- ⏳ Timeout handling
- ⏳ Abort signal handling
- ⏳ Bootstrap.js multi-location resolution

**Why Critical:** If runner breaks, plugins cannot execute at all.

## E2E Context Tests

**File:** `e2e-context.test.ts`

End-to-end tests that run **real CLI commands** with subprocess execution.

### What It Tests

- ✅ Complete context in real CLI execution
- ✅ Handler execution and exit code
- ✅ Working fs.exists in subprocess
- ✅ Working trace API

**Why Important:** Tests the FULL production pipeline: CLI → V3 adapter → subprocess → handler.

## Test Coverage Summary

```
Total Tests: 28 (23 passing, 5 todo)

✅ context-factory.test.ts    - 9 tests  (all passing)
✅ context-structure.test.ts  - 3 tests  (2 passing, 1 todo for Phase 6)
✅ sandbox-runner.test.ts     - 12 tests (8 passing, 4 todo for Phase 6)
✅ e2e-context.test.ts        - 4 tests  (all passing)
```

### Future Tests to Add

- [ ] Permission enforcement tests (fs, fetch, env)
- [ ] State broker integration tests
- [ ] Runtime shim tests (fs-shim, fetch-shim, env-shim)
- [ ] API module tests (output, artifacts, shell, events)
- [ ] Error handling tests (PluginError, TimeoutError, etc.)
- [ ] Subprocess IPC protocol tests (Phase 6)
- [ ] Bootstrap resolution fallback tests (Phase 6)
- [ ] V3 adapter integration tests

### Debugging Failed Tests

1. **Check the error output** - vitest shows exactly what's missing
2. **Look at real execution** - run a V3 command with debug logging:
   ```bash
   KB_PLUGIN_VERSION=3 pnpm kb plugin-template:hello-v3
   ```
3. **Compare structures** - diff test expectations with actual runtime

### CI Integration

These tests run on every commit via:
```bash
pnpm test
```

If tests fail in CI, **do not merge** until:
- Issue is understood
- Fix is implemented OR
- Snapshot is updated with proper justification
