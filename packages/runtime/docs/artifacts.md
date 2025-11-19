# Artifact System

The artifact system lets plugins exchange structured data through versioned files with lifecycle statuses, TTLs, and permissions.

## Core Concepts

### URI Scheme

Artifacts are addressed via the URI scheme `artifact://plugin-id/path/to/artifact`:

```typescript
// URI examples
const uri1 = 'artifact://mind/pack/output.md';
const uri2 = 'artifact://self/query/results.json'; // 'self' = current plugin
```

### Versioning

Artifacts can declare versions to manage compatibility:

```typescript
interface ArtifactMeta {
  version?: string;        // Data format version (e.g. "1.0.0")
  schemaVersion?: string;  // Schema version
}
```

Agents can check versions before reading:

```typescript
const meta = await ctx.extensions.artifacts?.getMeta({ uri: 'artifact://mind/pack/output.md' });
if (meta?.version && meta.version < '1.0.0') {
  // Incompatible version
}
```

### Lifecycle Statuses

Artifacts move through the following statuses:

- `pending` - write process started
- `ready` - ready for consumption
- `failed` - write error
- `expired` - TTL elapsed

### TTL and Cleanup

Artifacts can specify a TTL (time to live) for automatic cleanup:

```typescript
// In the manifest
artifacts: [{
  id: 'pack-output',
  pathTemplate: '.kb/mind/pack/{runId}.md',
  ttl: 3600, // 1 hour in seconds
}]

// Or when writing
await ctx.extensions.artifacts?.write({
  uri: 'artifact://mind/pack/output.md',
  data: markdown,
  ttl: 7200, // Override manifest TTL
});
```

### Capabilities

Artifacts can advertise capabilities:

- `stream` - streaming supported
- `watch` - change watching supported
- `multipart` - multipart uploads supported

```typescript
// In the manifest
artifacts: [{
  id: 'stream-output',
  pathTemplate: '.kb/stream/data.bin',
  capabilities: ['stream', 'watch'],
}]
```

## Usage

### Reading Artifacts

```typescript
// Read an artifact
const data = await ctx.extensions.artifacts?.read({
  uri: 'artifact://mind/pack/output.md',
  accept: ['text/markdown', 'application/json'],
});

// Fetch metadata without loading the file
const meta = await ctx.extensions.artifacts?.getMeta({
  uri: 'artifact://mind/pack/output.md',
});

// Wait for the artifact to become ready
const meta = await ctx.extensions.artifacts?.waitForArtifact({
  uri: 'artifact://mind/pack/output.md',
}, 30000); // 30-second timeout
```

### Writing Artifacts

```typescript
// Write an artifact
const result = await ctx.extensions.artifacts?.write({
  uri: 'artifact://mind/pack/output.md',
  data: markdown,
  contentType: 'text/markdown',
  ttl: 3600, // 1 hour
  mode: 'upsert', // or 'failIfExists'
});
```

### Discovery

```typescript
// List artifacts by pattern
const artifacts = await ctx.extensions.artifacts?.list({
  uri: 'artifact://mind/pack/**', // glob pattern
  status: ['ready'], // status filter
  minVersion: '1.0.0', // minimum version
});

for (const artifact of artifacts) {
  console.log(`${artifact.uri}: ${artifact.meta.status}`);
}
```

## Permissions

Plugins must declare permissions in their manifest to access artifacts:

```typescript
// Plugin manifest
permissions: {
  artifacts: {
    read: [
      {
        from: 'mind', // or 'self' for owned artifacts
        paths: ['pack/**', 'query/**'],
        allowedTypes: ['text/markdown', 'application/json'],
      },
    ],
    write: [
      {
        to: 'self', // only write to own artifacts
        paths: ['output/**'],
      },
    ],
  },
}
```

## Agent Chain Examples

### Example 1: Simple Chain

```typescript
// Agent A writes the result
await ctx.extensions.artifacts?.write({
  uri: 'artifact://agent-a/result.json',
  data: { result: 'processed' },
  ttl: 3600,
});

// Agent B reads the result
const data = await ctx.extensions.artifacts?.read({
  uri: 'artifact://agent-a/result.json',
});
```

### Example 2: Waiting for Readiness

```typescript
// Agent A starts writing (status: pending)
await ctx.extensions.artifacts?.write({
  uri: 'artifact://agent-a/result.json',
  data: heavyProcessing(),
});

// Agent B waits for readiness
try {
  const meta = await ctx.extensions.artifacts?.waitForArtifact({
    uri: 'artifact://agent-a/result.json',
  }, 60000); // wait up to 60 seconds
  
  if (meta.status === 'ready') {
    const data = await ctx.extensions.artifacts?.read({
      uri: 'artifact://agent-a/result.json',
    });
  }
} catch (error) {
  // Timeout or other error
}
```

### Example 3: Discovery and Filtering

```typescript
// Find all ready artifacts with version >= 1.0.0
const artifacts = await ctx.extensions.artifacts?.list({
  uri: 'artifact://agent-a/**',
  status: ['ready'],
  minVersion: '1.0.0',
});

// Process each one
for (const artifact of artifacts) {
  if (artifact.meta.expiresAt && artifact.meta.expiresAt < Date.now()) {
    // Artifact expired, skip it
    continue;
  }
  
  const data = await ctx.extensions.artifacts?.read({
    uri: artifact.uri,
  });
  // Handle data
}
```

## Types

```typescript
// URI scheme
type ArtifactURI = `artifact://${string}/${string}`;

// Statuses
type ArtifactStatus = 'pending' | 'ready' | 'failed' | 'expired';

// Capabilities
type ArtifactCapability = 'stream' | 'watch' | 'multipart';

// Requests
interface ArtifactReadRequest {
  uri: string;
  accept?: string[];
}

interface ArtifactWriteRequest {
  uri: string;
  data: unknown;
  contentType?: string;
  mode?: 'upsert' | 'failIfExists';
  ttl?: number;
}

interface ArtifactListRequest {
  uri: string; // with glob pattern
  status?: ArtifactStatus[];
  minVersion?: string;
}

// Metadata
interface ArtifactMeta {
  owner: string;
  size: number;
  sha256: string;
  contentType: string;
  encoding?: string;
  createdAt: number;
  updatedAt: number;
  version?: string;
  schemaVersion?: string;
  status: ArtifactStatus;
  expiresAt?: number;
  ttl?: number;
  capabilities?: ArtifactCapability[];
}
```

## Best Practices

1. **Always check the status** before reading critical artifacts:
   ```typescript
   const meta = await ctx.extensions.artifacts?.getMeta({ uri });
   if (meta?.status !== 'ready') {
     // Wait or handle the error
   }
   ```

2. **Use TTL** for temporary data:
   ```typescript
   await ctx.extensions.artifacts?.write({
     uri,
     data,
     ttl: 3600, // 1 hour
   });
   ```

3. **Validate versions** for compatibility:
   ```typescript
   const meta = await ctx.extensions.artifacts?.getMeta({ uri });
   if (meta?.version && meta.version < '1.0.0') {
     // Handle incompatibility
   }
   ```

4. **Use waitForArtifact** for async chains:
   ```typescript
   const meta = await ctx.extensions.artifacts?.waitForArtifact({ uri }, timeout);
   ```

5. **Filter by status** during discovery:
   ```typescript
   const artifacts = await ctx.extensions.artifacts?.list({
     uri: 'artifact://plugin/**',
     status: ['ready'],
   });
   ```




