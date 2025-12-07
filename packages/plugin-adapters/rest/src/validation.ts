/**
 * @module @kb-labs/plugin-adapter-rest/validation
 * Input/output validation for REST routes
 */

import type { SchemaRef } from '@kb-labs/plugin-manifest';
import { z } from 'zod';

/**
 * Resolve schema from SchemaRef
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
      throw new Error(`Schema reference must include export name: ${schemaRef.zod}`);
    }

    const resolvedPath = modulePath.startsWith('.')
      ? new URL(modulePath, `file://${basePath}/`).pathname
      : modulePath;

    if (!resolvedPath) {
      throw new Error(`Failed to resolve schema path: ${schemaRef.zod}`);
    }

    const module = await import(resolvedPath);
    const schema = module[exportName];

    if (!schema || typeof schema.parse !== 'function') {
      throw new Error(`Schema ${exportName} not found or not a Zod schema in ${modulePath}`);
    }

    return schema as z.ZodTypeAny;
  }

  // OpenAPI $ref - for now, return undefined (validation happens at API level)
  return undefined;
}

/**
 * Validate data against schema
 */
export function validateData<T>(
  data: unknown,
  schema: z.ZodTypeAny | undefined
): { valid: boolean; data?: T; error?: z.ZodError } {
  if (!schema) {
    return { valid: true, data: data as T };
  }

  const result = schema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data as T };
  }

  return { valid: false, error: result.error };
}
