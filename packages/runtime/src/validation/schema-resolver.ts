/**
 * @module @kb-labs/plugin-runtime/validation/schema-resolver
 * Resolve and load schema from SchemaRef
 */

import type { SchemaRef } from '@kb-labs/plugin-manifest';
import { z } from 'zod';
import * as path from 'node:path';

/**
 * Resolve and validate schema from SchemaRef
 */
export async function resolveSchema(
  schemaRef: SchemaRef | undefined,
  basePath: string
): Promise<z.ZodTypeAny | undefined> {
  if (!schemaRef) {
    return undefined;
  }

  if ('zod' in schemaRef) {
    // Zod schema reference: './schemas/review.ts#ReviewSchema'
    const [modulePath, exportName] = schemaRef.zod.split('#');
    if (!exportName || !modulePath) {
      throw new Error(
        `Schema reference must include export name: ${schemaRef.zod}`
      );
    }

    let resolvedPath: string;
    
    if (modulePath.startsWith('.')) {
      // Relative path - resolve relative to basePath
      // Use path.resolve for proper path resolution
      resolvedPath = path.resolve(basePath, modulePath);
      // For ESM, we need to add .js if not present
      if (!resolvedPath.endsWith('.js') && !resolvedPath.endsWith('.ts')) {
        // Try to find .js file in dist directory first (most common case)
        const distPath = path.join(basePath, 'dist', modulePath.replace(/^\.\//, '') + '.js');
        const fs = await import('node:fs/promises');
        try {
          await fs.access(distPath);
          resolvedPath = distPath;
        } catch {
          // Fallback to adding .js extension to resolved path
          resolvedPath = resolvedPath + '.js';
        }
      }
    } else {
      // Absolute or package path - use as-is
      resolvedPath = modulePath;
    }

    const module = await import(resolvedPath);
    const schema = module[exportName];

    if (!schema || typeof schema.parse !== 'function') {
      throw new Error(
        `Schema ${exportName} not found or not a Zod schema in ${modulePath}`
      );
    }

    return schema as z.ZodTypeAny;
  }

  // OpenAPI $ref - for now, return undefined (validation happens at API level)
  return undefined;
}

