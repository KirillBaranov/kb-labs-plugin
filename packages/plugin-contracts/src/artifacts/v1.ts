/**
 * @module @kb-labs/plugin-contracts/artifacts/v1
 * Artifacts API v1 type definitions
 * 
 * Versioning policy:
 * - MAJOR: Breaking changes in API (e.g., removing methods, changing signatures)
 * - MINOR: New fields added (backward compatible)
 * - PATCH: Type corrections, documentation updates
 */

/**
 * Artifact lifecycle status
 */
export type ArtifactStatusV1 = 'pending' | 'ready' | 'failed' | 'expired';

/**
 * Artifact capabilities
 */
export type ArtifactCapabilityV1 = 'stream' | 'watch' | 'multipart';

/**
 * Artifact metadata
 */
export interface ArtifactMetaV1 {
  owner: string;
  size: number;
  sha256: string;
  contentType: string;
  encoding?: string;
  createdAt: number;
  updatedAt: number;
  /** Version of the artifact data format (e.g., "1.0.0") */
  version?: string;
  /** Version of the schema used for validation */
  schemaVersion?: string;
  /** Lifecycle status of the artifact */
  status: ArtifactStatusV1;
  /** Timestamp when artifact expires (milliseconds since epoch) */
  expiresAt?: number;
  /** TTL in seconds */
  ttl?: number;
  /** Supported capabilities */
  capabilities?: ArtifactCapabilityV1[];
}

/**
 * Artifact read request
 */
export interface ArtifactReadRequestV1 {
  /** Artifact URI (artifact://plugin-id/path) */
  uri: string;
  /** Optional content type filter */
  accept?: string[];
}

/**
 * Artifact write request
 */
export interface ArtifactWriteRequestV1 {
  /** Artifact URI (artifact://plugin-id/path) */
  uri: string;
  /** Data to write */
  data: unknown;
  /** Content type */
  contentType?: string;
  /** Write mode */
  mode?: 'upsert' | 'failIfExists';
  /** TTL in seconds (overrides TTL from manifest) */
  ttl?: number;
}

/**
 * Artifact list request
 */
export interface ArtifactListRequestV1 {
  /** Artifact URI with pattern (artifact://plugin-id/pattern) */
  uri: string;
  /** Filter by status */
  status?: ArtifactStatusV1[];
  /** Minimum version required */
  minVersion?: string;
}

/**
 * Artifact information
 */
export interface ArtifactInfoV1 {
  /** Artifact URI */
  uri: string;
  /** Logical path (runtime-specific, may differ from URI path) */
  path?: string;
  /** Artifact metadata */
  meta: ArtifactMetaV1;
}

/**
 * Artifacts API v1 interface
 * Provides cross-plugin artifact access
 */
export interface ArtifactsApiV1 {
  /**
   * Read an artifact
   * @param request - Read request with URI and optional content type filter
   * @returns Promise resolving to artifact data (Buffer or object)
   */
  read(request: ArtifactReadRequestV1): Promise<Buffer | object>;

  /**
   * Write an artifact
   * @param request - Write request with URI, data, and options
   * @returns Promise resolving to artifact path and metadata
   */
  write(request: ArtifactWriteRequestV1): Promise<{ path: string; meta: ArtifactMetaV1 }>;

  /**
   * List artifacts matching a pattern
   * @param request - List request with URI pattern and filters
   * @returns Promise resolving to array of artifact information
   */
  list?(request: ArtifactListRequestV1): Promise<ArtifactInfoV1[]>;

  /**
   * Get artifact metadata
   * @param request - Read request with URI
   * @returns Promise resolving to artifact metadata or null if not found
   */
  getMeta?(request: ArtifactReadRequestV1): Promise<ArtifactMetaV1 | null>;
}

