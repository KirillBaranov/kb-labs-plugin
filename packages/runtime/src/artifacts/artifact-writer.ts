/**
 * @module @kb-labs/plugin-runtime/artifacts/artifact-writer
 * Write artifacts if declared in manifest
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import type { ExecutionContext } from '../types.js';
import type { ArtifactBroker } from '../artifacts/broker.js';
import { createDebugLogger, createLoggerOptionsFromContext } from '@kb-labs/sandbox';

/**
 * Write artifacts if declared
 */
export async function writeArtifactsIfAny(
  manifest: ManifestV2,
  ctx: ExecutionContext,
  data: unknown,
  artifactBroker?: ArtifactBroker
): Promise<void> {
  if (!manifest.artifacts || manifest.artifacts.length === 0) {
    return;
  }

  const loggerOptions = createLoggerOptionsFromContext(ctx);
  const logger = createDebugLogger(ctx.debug || false, 'runtime:artifacts', loggerOptions);
  const { substitutePathTemplate } = await import('../artifacts.js');

  // Use artifactBroker if available, otherwise fall back to old writeArtifact
  const useNewSystem = artifactBroker !== undefined;
  
  logger.debug('Artifact system selection', {
    useNewSystem,
    hasBroker: !!artifactBroker,
    artifactCount: manifest.artifacts?.length || 0,
  });

  for (const artifactDecl of manifest.artifacts) {
    try {
      // Extract artifact-specific data if data is an object with artifact keys
      // If data is an object, try to find a field matching artifact id (e.g., 'pack-output', 'query-output')
      // Otherwise, use data as-is
      let artifactData = data;
      if (data && typeof data === 'object' && !Array.isArray(data) && artifactDecl.id) {
        // Skip if data has exitCode (it's a command result wrapper)
        // Extract only artifact data, not the wrapper
        const dataObj = data as Record<string, unknown>;
        
        // Skip exitCode field
        if ('exitCode' in dataObj) {
          // This is a command result with exitCode, extract artifact data
          const artifactId = artifactDecl.id;
          const camelCaseId = artifactId.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          const kebabCaseId = artifactId;
          
          // Check for artifact field in the result object
          if (artifactId in dataObj) {
            artifactData = dataObj[artifactId];
          } else if (camelCaseId in dataObj) {
            artifactData = dataObj[camelCaseId];
          } else if (kebabCaseId in dataObj) {
            artifactData = dataObj[kebabCaseId];
          } else {
            // No artifact data found, skip this artifact
            artifactData = undefined;
          }
        } else {
          // Not a command result wrapper, try to find artifact field
          const artifactId = artifactDecl.id;
          const camelCaseId = artifactId.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          const kebabCaseId = artifactId;
          
          // Check for camelCase first (packOutput), then kebab-case (pack-output), then exact match
          if (artifactId in dataObj) {
            artifactData = dataObj[artifactId];
          } else if (camelCaseId in dataObj) {
            artifactData = dataObj[camelCaseId];
          } else if (kebabCaseId in dataObj) {
            artifactData = dataObj[kebabCaseId];
          }
          // If no match found, use data as-is (for backward compatibility)
        }
      }

      // Skip if artifact data is undefined or null
      if (artifactData === undefined || artifactData === null) {
        logger.debug('Skipping artifact (no data)', {
          artifactId: artifactDecl.id,
        });
        continue;
      }

      if (useNewSystem && artifactBroker) {
        // Use new artifact system with URI scheme
        logger.debug('Using new artifact system', {
          artifactId: artifactDecl.id,
        });
        
        // Resolve path template to get the actual path
        const resolvedPath = substitutePathTemplate(artifactDecl.pathTemplate, {
          runId: ctx.requestId,
          profile: 'default',
          pluginId: ctx.pluginId,
        });

        // Create URI: artifact://plugin-id/path
        const artifactUri = `artifact://${ctx.pluginId}/${resolvedPath}`;

        // Determine content type
        let contentType = 'application/json';
        if (resolvedPath.endsWith('.md')) {
          contentType = 'text/markdown';
        } else if (resolvedPath.endsWith('.toon')) {
          contentType = 'application/octet-stream';
        } else if (typeof artifactData === 'string') {
          contentType = 'text/plain';
        }

        logger.debug('Writing artifact via broker', {
          artifactId: artifactDecl.id,
          uri: artifactUri,
          contentType,
        });

        try {
          const result = await artifactBroker.write({
            uri: artifactUri,
            data: artifactData,
            contentType,
            ttl: artifactDecl.ttl,
            mode: 'upsert',
          });

          logger.debug('Artifact written', {
            artifactId: artifactDecl.id,
            uri: artifactUri,
            path: result.path,
            status: result.meta.status,
          });

          // Track artifact file for cleanup
          if (!ctx.tmpFiles) {
            ctx.tmpFiles = [];
          }
          ctx.tmpFiles.push(result.path);
        } catch (error) {
          // Log full error details for debugging
          const errorDetails = error && typeof error === 'object' 
            ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2)
            : String(error);
          logger.warn('Failed to write artifact via broker', {
            artifactId: artifactDecl.id,
            uri: artifactUri,
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            errorDetails,
          });
          // Also log to console for immediate visibility
          console.error('[writeArtifactsIfAny] Error writing artifact:', {
            artifactId: artifactDecl.id,
            uri: artifactUri,
            error: errorDetails,
            errorCode: error && typeof error === 'object' && 'code' in error ? (error as any).code : undefined,
            errorHttp: error && typeof error === 'object' && 'http' in error ? (error as any).http : undefined,
            errorMessage: error && typeof error === 'object' && 'message' in error ? (error as any).message : undefined,
            errorDetails: error && typeof error === 'object' ? JSON.stringify(error, Object.getOwnPropertyNames(error), 2) : undefined,
          });
        }
      } else {
        // Fall back to old system
        logger.debug('Using legacy artifact system', {
          artifactId: artifactDecl.id,
          useNewSystem,
          hasBroker: !!artifactBroker,
        });
        
        const { writeArtifact } = await import('../artifacts.js');
        const result = await writeArtifact(
          artifactDecl,
          artifactData,
          {
            requestId: ctx.requestId,
            pluginId: ctx.pluginId,
            pluginVersion: ctx.pluginVersion,
            basePath: ctx.outdir || ctx.workdir,
            variables: {
              runId: ctx.requestId,
              profile: 'default',
            },
          }
        );

        if (result.success && result.path) {
          logger.debug('Artifact written (legacy)', {
            artifactId: artifactDecl.id,
            path: result.path,
          });
          // Track artifact file for cleanup
          if (!ctx.tmpFiles) {
            ctx.tmpFiles = [];
          }
          ctx.tmpFiles.push(result.path);
        } else {
          logger.warn('Failed to write artifact (legacy)', {
            artifactId: artifactDecl.id,
            error: result.error,
          });
        }
      }
    } catch (error) {
      // Log error but don't fail execution
      logger.error('Failed to write artifact', {
        pluginId: ctx.pluginId,
        artifactId: artifactDecl.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

