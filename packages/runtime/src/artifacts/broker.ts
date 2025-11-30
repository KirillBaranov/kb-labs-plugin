/**
 * @module @kb-labs/plugin-runtime/artifacts/broker
 * Artifact broker for cross-plugin artifact access
 */

import type { ManifestV2, ArtifactAccess } from '@kb-labs/plugin-manifest';
import type { ExecutionContext, ErrorEnvelope } from '../types';
import type {
  ArtifactStatus as ArtifactStatusContract,
  ArtifactCapability as ArtifactCapabilityContract,
  ArtifactMeta as ArtifactMetaContract,
  ArtifactReadRequest as ArtifactReadRequestContract,
  ArtifactWriteRequest as ArtifactWriteRequestContract,
  ArtifactListRequest as ArtifactListRequestContract,
  ArtifactInfo as ArtifactInfoContract,
} from '@kb-labs/plugin-contracts';
import { ErrorCode } from '@kb-labs/api-contracts';
import { toErrorEnvelope, createErrorContext } from '../errors';
import { emitAnalyticsEvent } from '../analytics';
import { createRuntimeLogger } from '../logging';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { minimatch } from 'minimatch';

/**
 * Artifact lifecycle status
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export type ArtifactStatus = ArtifactStatusContract;

/**
 * Artifact capabilities
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export type ArtifactCapability = ArtifactCapabilityContract;

/**
 * Artifact metadata
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface ArtifactMeta extends ArtifactMetaContract {}

/**
 * Parse artifact URI to plugin ID and path
 * Format: artifact://plugin-id/path/to/artifact
 */
export function parseArtifactUri(uri: string): { pluginId: string; path: string } {
  if (!uri.startsWith('artifact://')) {
    throw new Error(`Invalid artifact URI: ${uri}. Must start with 'artifact://'`);
  }

  const withoutScheme = uri.slice('artifact://'.length);
  
  // Find the first slash that is NOT part of the plugin ID
  // Plugin IDs can contain slashes (e.g., @kb-labs/mind), so we need to find
  // the first slash that comes after the plugin ID scope (after @)
  // Format: artifact://@scope/name/path/to/artifact
  // We need to find the first slash after the plugin ID, which starts with @
  
  if (!withoutScheme.startsWith('@')) {
    // Simple case: no @, plugin ID is everything before first /
    const firstSlash = withoutScheme.indexOf('/');
    if (firstSlash === -1) {
      throw new Error(`Invalid artifact URI: ${uri}. Must include plugin ID and path`);
    }
    const pluginId = withoutScheme.slice(0, firstSlash);
    const artifactPath = withoutScheme.slice(firstSlash + 1);
    
    if (!pluginId || !artifactPath) {
      throw new Error(`Invalid artifact URI: ${uri}. Plugin ID and path cannot be empty`);
    }
    
    return { pluginId, path: artifactPath };
  }
  
  // Complex case: plugin ID starts with @
  // Find the first slash that comes after the plugin ID
  // Plugin ID format: @scope/name (e.g., @kb-labs/mind)
  // We need to find the first slash after the plugin ID ends
  
  // Find the end of plugin ID by looking for the pattern: @scope/name/
  // The plugin ID ends when we find a slash followed by a non-slash character
  // that is not part of the plugin ID scope
  
  // Split by '/' and find where plugin ID ends
  // Plugin ID is everything up to the first path segment that doesn't start with @
  // But we need to be smarter: if plugin ID is @kb-labs/mind, then
  // the path should be everything after the last segment of the plugin ID
  
  // Actually, simpler approach: plugin ID is everything before the first path segment
  // that starts with a dot (.) or is a valid path segment
  // But that's complex. Let's use a simpler heuristic:
  // If URI is artifact://@scope/name/path, then:
  // - pluginId = @scope/name
  // - path = path
  
  // Find the first slash after the @ that is followed by a path segment
  // We'll assume the plugin ID is at most 2 segments: @scope/name
  // So we need to find the 3rd slash (or the 2nd if plugin ID is just @scope)
  
  const parts = withoutScheme.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid artifact URI: ${uri}. Must include plugin ID and path`);
  }
  
  // Plugin ID is @scope or @scope/name (first 1 or 2 parts)
  // Path is everything after
  // For @kb-labs/mind/.kb/mind/pack/default/r-0c7zkle.md:
  // parts = ['@kb-labs', 'mind', '.kb', 'mind', 'pack', 'default', 'r-0c7zkle.md']
  // Plugin ID should be @kb-labs/mind (first 2 parts)
  // Path should be .kb/mind/pack/default/r-0c7zkle.md (rest)
  
  let pluginId: string;
  let artifactPath: string;
  
  // Check if we have at least 3 parts and first part starts with @
  // This means plugin ID is @scope/name (2 parts)
  if (parts.length >= 3 && parts[0] && parts[0].startsWith('@') && parts[1]) {
    // Plugin ID is @scope/name (first 2 parts)
    pluginId = `${parts[0]}/${parts[1]}`;
    artifactPath = parts.slice(2).join('/');
  } else if (parts.length >= 2 && parts[0] && parts[0].startsWith('@')) {
    // Plugin ID is @scope (first 1 part)
    pluginId = parts[0];
    artifactPath = parts.slice(1).join('/');
  } else {
    throw new Error(`Invalid artifact URI: ${uri}. Plugin ID must start with @`);
  }

  if (!pluginId || !artifactPath) {
    throw new Error(`Invalid artifact URI: ${uri}. Plugin ID and path cannot be empty`);
  }

  return { pluginId, path: artifactPath };
}

/**
 * Artifact read request
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface ArtifactReadRequest extends ArtifactReadRequestContract {}

/**
 * Artifact write request
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface ArtifactWriteRequest extends ArtifactWriteRequestContract {}

/**
 * Artifact list request
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface ArtifactListRequest extends ArtifactListRequestContract {}

/**
 * Artifact information
 * @deprecated Import from @kb-labs/plugin-contracts instead
 */
export interface ArtifactInfo extends ArtifactInfoContract {
  /** Logical path (runtime-specific extension, always present in runtime) */
  path: string;
}

/**
 * Artifact broker for managing cross-plugin artifact access
 */
export class ArtifactBroker {
  private artifactBaseDir: string;

  constructor(
    private callerManifest: ManifestV2,
    private callerCtx: ExecutionContext,
    private registry?: import('../registry').PluginRegistry,
    artifactBaseDir?: string
  ) {
    // Default artifact base directory
    this.artifactBaseDir =
      artifactBaseDir || path.join(callerCtx.workdir, '.artifacts');
  }

  private createLogger(extra: Record<string, unknown> = {}) {
    return createRuntimeLogger('artifacts', this.callerCtx, {
      caller: this.callerCtx.pluginId,
      ...extra,
    });
  }

  /**
   * Read artifact
   */
  async read(request: ArtifactReadRequest): Promise<Buffer | object> {
    const startedAt = Date.now();

    try {
      // 1. Parse URI
      const { pluginId, path: artifactPath } = parseArtifactUri(request.uri);

      // 2. Validate read permissions
      const permissionCheck = this.checkReadPermission(request);
      if (!permissionCheck.allow) {
        await emitAnalyticsEvent('artifact.read.denied', {
          caller: this.callerCtx.pluginId,
          uri: request.uri,
          reason: permissionCheck.reason,
          traceId: this.callerCtx.traceId,
          spanId: this.callerCtx.spanId,
          requestId: this.callerCtx.requestId,
        });

        const error = toErrorEnvelope(
          ErrorCode.ARTIFACT_READ_DENIED,
          403,
          {
            caller: this.callerCtx.pluginId,
            uri: request.uri,
            reason: permissionCheck.reason,
            ...createErrorContext(
              ErrorCode.ARTIFACT_READ_DENIED,
              'artifact.read',
              undefined,
              permissionCheck.reason || 'Read denied by policy'
            ),
          },
          this.callerCtx,
          { timeMs: Date.now() - startedAt },
          this.callerManifest.permissions
        );

        if (permissionCheck.remediation) {
          error.details = {
            ...error.details,
            remediation: permissionCheck.remediation,
          };
        }

        throw error;
      }

      // 3. Resolve logical path to physical path
      const physicalPath = this.resolvePath(pluginId, artifactPath);

      // 4. Read artifact
      const data = await fs.readFile(physicalPath, 'utf8');

      // 5. Read metadata if available
      const metaPath = `${physicalPath}.meta.json`;
      let meta: ArtifactMeta | undefined;
      try {
        const metaData = await fs.readFile(metaPath, 'utf8');
        meta = JSON.parse(metaData) as ArtifactMeta;
        // Backward compatibility: if status is missing, default to 'ready'
        if (meta && !meta.status) {
          meta.status = 'ready';
        }
      } catch {
        // Metadata file doesn't exist - continue without it
      }

      // 6. Check if artifact is expired
      if (meta?.expiresAt && meta.expiresAt < Date.now()) {
        // Update status to expired
        meta.status = 'expired';
        try {
          await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
        } catch {
          // Can't update - ignore
        }
      }

      // 7. Check artifact status
      if (meta?.status === 'expired') {
        throw toErrorEnvelope(
          ErrorCode.ARTIFACT_READ_DENIED,
          410,
          {
            caller: this.callerCtx.pluginId,
            uri: request.uri,
            reason: 'Artifact has expired',
          },
          this.callerCtx,
          { timeMs: Date.now() - startedAt },
          this.callerManifest.permissions
        );
      }

      if (meta?.status === 'failed') {
        throw toErrorEnvelope(
          ErrorCode.ARTIFACT_READ_DENIED,
          500,
          {
            caller: this.callerCtx.pluginId,
            uri: request.uri,
            reason: 'Artifact write failed',
          },
          this.callerCtx,
          { timeMs: Date.now() - startedAt },
          this.callerManifest.permissions
        );
      }

      // 8. Check content type if requested
      if (request.accept && meta?.contentType) {
        if (!request.accept.includes(meta.contentType)) {
          throw toErrorEnvelope(
            ErrorCode.ARTIFACT_READ_DENIED,
            403,
            {
              caller: this.callerCtx.pluginId,
              uri: request.uri,
              reason: 'contentType not allowed',
              contentType: meta.contentType,
              allowedTypes: request.accept,
            },
            this.callerCtx,
            { timeMs: Date.now() - startedAt },
            this.callerManifest.permissions
          );
        }
      }

      // 9. Parse JSON if content type suggests it
      if (meta?.contentType?.includes('json') || !meta) {
        try {
          return JSON.parse(data);
        } catch {
          // Not JSON, return as Buffer
        }
      }

      // 10. Emit read event
      await emitAnalyticsEvent('artifact.read', {
        caller: this.callerCtx.pluginId,
        uri: request.uri,
        size: Buffer.byteLength(data),
        sha256: meta?.sha256,
        traceId: this.callerCtx.traceId,
        spanId: this.callerCtx.spanId,
        requestId: this.callerCtx.requestId,
      });

      return Buffer.from(data, 'utf8');
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'http' in error
      ) {
        throw error;
      }

      const timeMs = Date.now() - startedAt;
      const errorEnvelope = toErrorEnvelope(
        ErrorCode.ARTIFACT_READ_DENIED,
        403,
        {
          error: error instanceof Error ? error.message : String(error),
          caller: this.callerCtx.pluginId,
          uri: request.uri,
        },
        this.callerCtx,
        { timeMs },
        this.callerManifest.permissions
      );

      throw errorEnvelope;
    }
  }

  /**
   * Write artifact
   */
  async write(request: ArtifactWriteRequest): Promise<{
    path: string;
    meta: ArtifactMeta;
  }> {
    const startedAt = Date.now();
    const logger = this.createLogger({ uri: request.uri, action: 'write' });

    try {
      // 1. Parse URI
      const parseResult = parseArtifactUri(request.uri);
      const pluginId = parseResult.pluginId;
      const artifactPath = parseResult.path;
      
      // Debug: log URI parsing
      logger.debug('Parsing artifact URI', {
        uri: request.uri,
        pluginId,
        artifactPath,
      });
      

      // 2. Validate write permissions
      const permissionCheck = this.checkWritePermission(request);
      logger.debug('Permission check', {
        uri: request.uri,
        allow: permissionCheck.allow,
        reason: permissionCheck.reason,
      });
      if (!permissionCheck.allow) {
        await emitAnalyticsEvent('artifact.write.denied', {
          caller: this.callerCtx.pluginId,
          uri: request.uri,
          reason: permissionCheck.reason,
          traceId: this.callerCtx.traceId,
          spanId: this.callerCtx.spanId,
          requestId: this.callerCtx.requestId,
        });

        const error = toErrorEnvelope(
          ErrorCode.ARTIFACT_WRITE_DENIED,
          403,
          {
            caller: this.callerCtx.pluginId,
            uri: request.uri,
            reason: permissionCheck.reason,
            ...createErrorContext(
              ErrorCode.ARTIFACT_WRITE_DENIED,
              'artifact.write',
              undefined,
              permissionCheck.reason || 'Write denied by policy'
            ),
          },
          this.callerCtx,
          { timeMs: Date.now() - startedAt },
          this.callerManifest.permissions
        );

        if (permissionCheck.remediation) {
          error.details = {
            ...error.details,
            remediation: permissionCheck.remediation,
          };
        }

        throw error;
      }

      // 3. Resolve logical path to physical path
      const physicalPath = this.resolvePath(pluginId, artifactPath);
      
      // Debug: log path resolution
      logger.debug('Resolving artifact path', {
        uri: request.uri,
        pluginId,
        artifactPath,
        physicalPath,
        artifactBaseDir: this.artifactBaseDir,
      });

      // 4. Check if exists (for failIfExists mode)
      if (request.mode === 'failIfExists') {
        try {
          await fs.access(physicalPath);
          throw toErrorEnvelope(
            ErrorCode.CONFLICT,
            409,
            {
              caller: this.callerCtx.pluginId,
              uri: request.uri,
              reason: 'Artifact already exists',
            },
            this.callerCtx,
            { timeMs: Date.now() - startedAt },
            this.callerManifest.permissions
          );
        } catch (error) {
          if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code !== 'ENOENT'
          ) {
            throw error;
          }
          // File doesn't exist, continue
        }
      }

      // 4. Prepare data
      const contentType = request.contentType || 'application/json';
      const encoding = contentType.includes('json') ? 'utf8' : 'binary';
      const data =
        typeof request.data === 'string'
          ? request.data
          : JSON.stringify(request.data, null, 2);
      const buffer = Buffer.from(data, encoding);

      // 5. Calculate metadata
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const size = buffer.length;
      const now = Date.now();

      // 6. Atomic write: write to .part file first
      const dir = path.dirname(physicalPath);
      await fs.mkdir(dir, { recursive: true });

      const tmpDir = path.join(dir, '.tmp');
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpPath = path.join(
        tmpDir,
        `${path.basename(physicalPath)}.${now}.part`
      );

      // Write data to temp file
      await fs.writeFile(tmpPath, buffer, encoding);

      // Calculate TTL and expiresAt
      // TTL from request overrides TTL from manifest (if available)
      const ttl = request.ttl; // TODO: Get from manifest ArtifactDecl if not provided
      const expiresAt = ttl ? now + ttl * 1000 : undefined;

      // Write metadata (status: pending initially, will be updated to ready after successful write)
      const meta: ArtifactMeta = {
        owner: this.callerCtx.pluginId,
        size,
        sha256,
        contentType,
        encoding,
        createdAt: now,
        updatedAt: now,
        status: 'pending',
        ttl,
        expiresAt,
      };

      const metaPath = `${physicalPath}.meta.json`;
      const metaTmpPath = `${tmpPath}.meta.json`;
      await fs.writeFile(metaTmpPath, JSON.stringify(meta, null, 2), 'utf8');

      // 7. Atomic rename: rename data file first
      try {
        await fs.rename(tmpPath, physicalPath);
      } catch (renameError) {
        logger.error('Failed to rename artifact file', {
          tmpPath,
          physicalPath,
          error: renameError instanceof Error ? renameError.message : String(renameError),
        });
        throw renameError;
      }
      
      // 8. Update status to ready after successful write
      // After rename, tmpPath no longer exists, so we need a new temp path for meta
      meta.status = 'ready';
      meta.updatedAt = Date.now();
      // Create new temp path for updated meta (in same tmp dir)
      const metaTmpPath2 = path.join(tmpDir, `${path.basename(physicalPath)}.meta.${Date.now()}.part`);
      try {
        await fs.writeFile(metaTmpPath2, JSON.stringify(meta, null, 2), 'utf8');
        await fs.rename(metaTmpPath2, metaPath);
      } catch (metaError) {
        logger.error('Failed to write/rename meta file', {
          metaTmpPath2,
          metaPath,
          error: metaError instanceof Error ? metaError.message : String(metaError),
        });
        throw metaError;
      }
      
      // Debug: log paths for troubleshooting
      logger.debug('Artifact and meta written', {
        physicalPath,
        metaPath,
        uri: request.uri,
        metaExists: await fs.access(metaPath).then(() => true).catch(() => false),
      });

      // 8. Emit write event
      await emitAnalyticsEvent('artifact.write', {
        caller: this.callerCtx.pluginId,
        uri: request.uri,
        size,
        sha256,
        contentType,
        traceId: this.callerCtx.traceId,
        spanId: this.callerCtx.spanId,
        requestId: this.callerCtx.requestId,
      });

      return {
        path: physicalPath,
        meta,
      };
    } catch (error) {
      // Log error for debugging
      const errorDetails = error && typeof error === 'object' 
        ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
        : String(error);
      logger.error('Error writing artifact', {
        uri: request.uri,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorDetails,
      });
      // Also log to console for immediate visibility
      console.error('[ArtifactBroker.write] Error:', {
        uri: request.uri,
        error: errorDetails,
        errorCode: error && typeof error === 'object' && 'code' in error ? (error as any).code : undefined,
        errorHttp: error && typeof error === 'object' && 'http' in error ? (error as any).http : undefined,
        errorMessage: error && typeof error === 'object' && 'message' in error ? (error as any).message : undefined,
      });
      
      // Try to mark artifact as failed if we have a URI
      if (request.uri) {
        try {
          const { pluginId, path: artifactPath } = parseArtifactUri(request.uri);
          const physicalPath = this.resolvePath(pluginId, artifactPath);
          const metaPath = `${physicalPath}.meta.json`;
          let meta: ArtifactMeta | undefined;
          try {
            const metaData = await fs.readFile(metaPath, 'utf8');
            meta = JSON.parse(metaData);
            if (meta) {
              meta.status = 'failed';
              meta.updatedAt = Date.now();
              await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
            }
          } catch {
            // Metadata file doesn't exist or can't be updated - ignore
          }
        } catch {
          // Can't update status - ignore
        }
      }

      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'http' in error
      ) {
        throw error;
      }

      const timeMs = Date.now() - startedAt;
      const errorEnvelope = toErrorEnvelope(
        ErrorCode.ARTIFACT_WRITE_DENIED,
        403,
        {
          error: error instanceof Error ? error.message : String(error),
          caller: this.callerCtx.pluginId,
          uri: request.uri,
        },
        this.callerCtx,
        { timeMs },
        this.callerManifest.permissions
      );

      throw errorEnvelope;
    }
  }

  /**
   * Check read permission
   */
  private checkReadPermission(request: ArtifactReadRequest): {
    allow: boolean;
    reason?: string;
    remediation?: string;
  } {
    const artifacts = this.callerManifest.permissions?.artifacts;
    if (!artifacts || !artifacts.read || artifacts.read.length === 0) {
      return {
        allow: false,
        reason: 'no read permissions',
        remediation: 'Add permissions.artifacts.read in caller manifest',
      };
    }

    // Parse URI to get plugin ID and path
    const { pluginId: sourcePlugin, path: artifactPath } = parseArtifactUri(request.uri);

    for (const readPerm of artifacts.read) {
      const fromPlugin =
        readPerm.from === 'self' ? this.callerCtx.pluginId : readPerm.from;

      if (fromPlugin !== sourcePlugin) {
        continue;
      }

      // Check if path matches any allowed pattern
      const matches = readPerm.paths.some((pattern) =>
        minimatch(artifactPath, pattern)
      );

      if (!matches) {
        continue;
      }

      // Check content type if specified
      if (readPerm.allowedTypes && request.accept) {
        const contentTypeMatches = request.accept.some((ct) =>
          readPerm.allowedTypes!.includes(ct)
        );
        if (!contentTypeMatches) {
          return {
            allow: false,
            reason: 'contentType not allowed',
            remediation: `Add contentType to permissions.artifacts.read[].allowedTypes`,
          };
        }
      }

      return { allow: true };
    }

    return {
      allow: false,
      reason: 'path not allowed',
      remediation: `Add '${artifactPath}' to permissions.artifacts.read in caller manifest`,
    };
  }

  /**
   * Check write permission
   */
  private checkWritePermission(request: ArtifactWriteRequest): {
    allow: boolean;
    reason?: string;
    remediation?: string;
  } {
    const artifacts = this.callerManifest.permissions?.artifacts;
    if (!artifacts || !artifacts.write || artifacts.write.length === 0) {
      return {
        allow: false,
        reason: 'no write permissions',
        remediation: 'Add permissions.artifacts.write in caller manifest',
      };
    }

    // Parse URI to get plugin ID and path
    const parseResult = parseArtifactUri(request.uri);
    const targetPlugin = parseResult.pluginId;
    const artifactPath = parseResult.path;
    
    // Debug: log permission check
    const permLogger = this.createLogger({
      uri: request.uri,
      action: 'write-permission',
    });

    permLogger.debug('Checking write permission', {
      uri: request.uri,
      callerPlugin: this.callerCtx.pluginId,
      targetPlugin,
      artifactPath,
      writePerms: artifacts.write,
    });

    for (const writePerm of artifacts.write) {
      const toPlugin =
        writePerm.to === 'self' ? this.callerCtx.pluginId : writePerm.to;

      permLogger.debug('Checking write permission rule', {
        toPlugin,
        targetPlugin,
        matches: toPlugin === targetPlugin,
        paths: writePerm.paths,
        artifactPath,
      });

      if (toPlugin !== targetPlugin) {
        continue;
      }

      // Check if path matches any allowed pattern
      const matches = writePerm.paths.some((pattern) => {
        const result = minimatch(artifactPath, pattern);
        permLogger.debug('Path pattern match', {
          pattern,
          artifactPath,
          matches: result,
        });
        return result;
      });

      if (matches) {
        return { allow: true };
      }
    }

    return {
      allow: false,
      reason: 'path not allowed',
      remediation: `Add '${artifactPath}' to permissions.artifacts.write in caller manifest`,
    };
  }

  /**
   * List artifacts matching pattern
   */
  async list(request: ArtifactListRequest): Promise<ArtifactInfo[]> {
    try {
      // Parse URI to get plugin ID and pattern
      const { pluginId, path: pattern } = parseArtifactUri(request.uri);
      const actualPluginId = pluginId === 'self' ? this.callerCtx.pluginId : pluginId;

      // Resolve plugin directory
      const pluginDir = path.join(this.artifactBaseDir, actualPluginId);
      
      // Check if directory exists
      try {
        await fs.access(pluginDir);
      } catch {
        // Directory doesn't exist - return empty list
        return [];
      }

      // Find all artifacts matching pattern
      const artifacts: ArtifactInfo[] = [];
      const files = await fs.readdir(pluginDir, { recursive: true });
      
      for (const file of files) {
        // Skip metadata files and temp files
        if (file.endsWith('.meta.json') || file.includes('.tmp') || file.includes('.part')) {
          continue;
        }

        // Check if file matches pattern
        const relativePath = path.relative(pluginDir, path.join(pluginDir, file));
        if (!minimatch(relativePath, pattern)) {
          continue;
        }

        // Read metadata
        const metaPath = path.join(pluginDir, `${file}.meta.json`);
        let meta: ArtifactMeta | undefined;
        try {
          const metaData = await fs.readFile(metaPath, 'utf8');
          meta = JSON.parse(metaData) as ArtifactMeta;
          // Backward compatibility: if status is missing, default to 'ready'
          if (!meta || !meta.status) {
            if (meta) {
              meta.status = 'ready';
            } else {
              continue;
            }
          }
        } catch {
          // Metadata file doesn't exist - skip
          continue;
        }

        // TypeScript guard: meta should be defined at this point
        if (!meta) {
          continue;
        }

        // Filter by status if specified
        if (request.status && !request.status.includes(meta.status)) {
          continue;
        }

        // Filter by version if specified
        if (request.minVersion && meta.version) {
          // Simple version comparison (semver comparison would be better)
          if (meta.version < request.minVersion) {
            continue;
          }
        }

        // Check if expired
        if (meta.expiresAt && meta.expiresAt < Date.now()) {
          meta.status = 'expired';
          try {
            await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
          } catch {
            // Can't update - ignore
          }
          if (request.status && !request.status.includes('expired')) {
            continue;
          }
        }

        const artifactUri = `artifact://${actualPluginId}/${relativePath}`;
        artifacts.push({
          uri: artifactUri,
          path: relativePath,
          meta,
        });
      }

      return artifacts;
    } catch (error) {
      // Return empty list on error
      return [];
    }
  }

  /**
   * Get artifact metadata without reading the file
   */
  async getMeta(request: ArtifactReadRequest): Promise<ArtifactMeta | null> {
    try {
      // Parse URI
      const { pluginId, path: artifactPath } = parseArtifactUri(request.uri);

      // Resolve physical path
      const physicalPath = this.resolvePath(pluginId, artifactPath);

      // Read metadata
      const metaPath = `${physicalPath}.meta.json`;
      try {
        const metaData = await fs.readFile(metaPath, 'utf8');
        const meta = JSON.parse(metaData) as ArtifactMeta;
        
        if (!meta) {
          return null;
        }
        
        // Backward compatibility: if status is missing, default to 'ready'
        if (!meta.status) {
          meta.status = 'ready';
        }

        // Check if expired
        if (meta.expiresAt && meta.expiresAt < Date.now()) {
          meta.status = 'expired';
          try {
            await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
          } catch {
            // Can't update - ignore
          }
        }

        return meta;
      } catch {
        // Metadata file doesn't exist
        return null;
      }
    } catch {
      return null;
    }
  }

  /**
   * Wait for artifact to be ready (or timeout)
   */
  async waitForArtifact(
    request: ArtifactReadRequest,
    timeout: number = 30000
  ): Promise<ArtifactMeta> {
    const startTime = Date.now();
    const pollInterval = 500; // Poll every 500ms

    while (Date.now() - startTime < timeout) {
      const meta = await this.getMeta(request);
      
      if (meta) {
        if (meta.status === 'ready') {
          return meta;
        }
        if (meta.status === 'failed' || meta.status === 'expired') {
          throw toErrorEnvelope(
            ErrorCode.ARTIFACT_READ_DENIED,
            410,
            {
              caller: this.callerCtx.pluginId,
              uri: request.uri,
              reason: `Artifact status is ${meta.status}`,
            },
            this.callerCtx,
            { timeMs: Date.now() - startTime },
            this.callerManifest.permissions
          );
        }
        // Status is 'pending', continue waiting
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Timeout
    throw toErrorEnvelope(
      ErrorCode.ARTIFACT_READ_DENIED,
      408,
      {
        caller: this.callerCtx.pluginId,
        uri: request.uri,
        reason: 'Timeout waiting for artifact to be ready',
      },
      this.callerCtx,
      { timeMs: Date.now() - startTime },
      this.callerManifest.permissions
    );
  }

  /**
   * Resolve logical path to physical path
   */
  private resolvePath(pluginId: string | 'self', logicalPath: string): string {
    const actualPluginId = pluginId === 'self' ? this.callerCtx.pluginId : pluginId;

    // Logical format: @pluginId/path/to/artifact.json
    // Remove @pluginId prefix if present
    const cleanPath = logicalPath.startsWith(`@${actualPluginId}/`)
      ? logicalPath.slice(`@${actualPluginId}/`.length)
      : logicalPath;

    // Physical path: artifactBaseDir/pluginId/path/to/artifact.json
    return path.join(this.artifactBaseDir, actualPluginId, cleanPath);
  }
}

