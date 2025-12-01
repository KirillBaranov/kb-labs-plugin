/**
 * @module @kb-labs/plugin-runtime/artifacts
 * Artifact writer with path templating and validation
 */

import type { ArtifactDecl } from '@kb-labs/plugin-manifest';
import { ErrorCode } from '@kb-labs/rest-api-contracts';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';

/**
 * Artifact write context
 */
export interface ArtifactWriteContext {
  requestId: string;
  pluginId: string;
  pluginVersion: string;
  basePath: string;
  variables?: Record<string, string | number>;
}

/**
 * Substitute path template with variables
 * Supported placeholders: {profile}, {runId}, {ts}
 */
export function substitutePathTemplate(
  template: string,
  variables: Record<string, string | number> = {}
): string {
  let result = template;

  // Add timestamp if {ts} placeholder exists
  if (result.includes('{ts}')) {
    variables.ts = Date.now();
  }

  // Substitute all placeholders
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{${key}}`;
    if (result.includes(placeholder)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
  }

  return result;
}

/**
 * Resolve and validate schema from ArtifactDecl
 */
async function resolveArtifactSchema(
  decl: ArtifactDecl,
  basePath: string
): Promise<z.ZodTypeAny | undefined> {
  if (!decl.schemaRef) {
    return undefined;
  }

  if ('zod' in decl.schemaRef) {
    const [modulePath, exportName] = decl.schemaRef.zod.split('#');
    if (!exportName || !modulePath) {
      throw new Error(`Schema reference must include export name: ${decl.schemaRef.zod}`);
    }

    const resolvedPath = modulePath.startsWith('.')
      ? new URL(modulePath, `file://${basePath}/`).pathname
      : modulePath;

    if (!resolvedPath) {
      throw new Error(`Failed to resolve schema path: ${decl.schemaRef.zod}`);
    }

    const module = await import(resolvedPath);
    const schema = module[exportName];

    if (!schema || typeof schema.parse !== 'function') {
      throw new Error(`Schema ${exportName} not found or not a Zod schema in ${modulePath}`);
    }

    return schema as z.ZodTypeAny;
  }

  // OpenAPI $ref - skip validation for now
  return undefined;
}

/**
 * Write artifact with validation and atomic write
 */
export async function writeArtifact(
  decl: ArtifactDecl,
  data: unknown,
  context: ArtifactWriteContext
): Promise<{ success: boolean; path?: string; error?: string }> {
  let tmpPath: string | undefined;
  try {
    // Substitute path template
    const resolvedPath = substitutePathTemplate(decl.pathTemplate, {
      ...context.variables,
      pluginId: context.pluginId,
      requestId: context.requestId,
    });

    // Make absolute path
    const absolutePath = path.isAbsolute(resolvedPath)
      ? resolvedPath
      : path.join(context.basePath, resolvedPath);

    // Validate data against schema (if provided) BEFORE write
    if (decl.schemaRef) {
      const schema = await resolveArtifactSchema(decl, context.basePath);
      if (schema) {
        const result = schema.safeParse(data);
        if (!result.success) {
          return {
            success: false,
            error: `Artifact schema validation failed: ${result.error.message}`,
          };
        }
        data = result.data;
      }
    }

    // Ensure directory exists
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });

    // Atomic write: write to tmp file first, then rename
    const tmpDir = path.join(dir, '.tmp');
    await fs.mkdir(tmpDir, { recursive: true });
    tmpPath = path.join(tmpDir, `${path.basename(absolutePath)}.${Date.now()}.tmp`);

    // Write to tmp file
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    await fs.writeFile(tmpPath, content, 'utf8');

    // Atomic rename
    await fs.rename(tmpPath, absolutePath);
    tmpPath = undefined; // Clear tmp path after successful rename

    return {
      success: true,
      path: absolutePath,
    };
  } catch (error) {
    // Cleanup tmp file on error
    if (tmpPath) {
      try {
        await fs.unlink(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
