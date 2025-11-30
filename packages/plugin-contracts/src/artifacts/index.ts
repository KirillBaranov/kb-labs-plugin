/**
 * @module @kb-labs/plugin-contracts/artifacts
 * Artifacts API type definitions with versioning support
 */

export * from './v1';

// Import v1 types for re-export with current version names
import type {
  ArtifactStatusV1,
  ArtifactCapabilityV1,
  ArtifactMetaV1,
  ArtifactReadRequestV1,
  ArtifactWriteRequestV1,
  ArtifactListRequestV1,
  ArtifactInfoV1,
  ArtifactsApiV1,
} from './v1';

// Export current version as default (for convenience)
// When v2 is introduced, this will be updated
export type ArtifactStatus = ArtifactStatusV1;
export type ArtifactCapability = ArtifactCapabilityV1;
export type ArtifactMeta = ArtifactMetaV1;
export type ArtifactReadRequest = ArtifactReadRequestV1;
export type ArtifactWriteRequest = ArtifactWriteRequestV1;
export type ArtifactListRequest = ArtifactListRequestV1;
export type ArtifactInfo = ArtifactInfoV1;
export type ArtifactsApi = ArtifactsApiV1;

