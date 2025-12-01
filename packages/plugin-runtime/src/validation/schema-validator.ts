/**
 * @module @kb-labs/plugin-runtime/validation/schema-validator
 * Validate input/output against schemas
 */

import type {
  ManifestV2,
  RestRouteDecl,
  CliCommandDecl,
} from '@kb-labs/plugin-manifest';
import type {
  ExecutionContext,
  HandlerRef,
} from '../types';
import { z } from 'zod';
import { resolveSchema } from './schema-resolver';

/**
 * Validate input/output against schema
 */
export function validateSchema<T>(
  data: unknown,
  schema: z.ZodTypeAny | undefined
): { valid: boolean; data?: T; errors?: z.ZodError } {
  if (!schema) {
    return { valid: true, data: data as T };
  }

  const result = schema.safeParse(data);
  if (result.success) {
    return { valid: true, data: result.data as T };
  }

  return { valid: false, errors: result.error };
}

/**
 * Validate input schema
 */
export async function validateInput(
  manifest: ManifestV2,
  routeOrCommand: string,
  input: unknown,
  handlerRef: HandlerRef,
  ctx?: ExecutionContext
): Promise<{ ok: boolean; errors?: z.ZodError }> {
  // Find route or command
  const handlerRefStr = `${handlerRef.file}#${handlerRef.export}`;
  const restRoute = manifest.rest?.routes.find(
    (r: RestRouteDecl) => r.handler === handlerRefStr
  );
  const cliCommand = manifest.cli?.commands.find(
    (c: CliCommandDecl) => c.handler === handlerRefStr
  );

  const inputSchemaRef = restRoute?.input || undefined;
  if (!inputSchemaRef) {
    return { ok: true };
  }

  // Use pluginRoot from context (required)
  if (!ctx?.pluginRoot) {
    throw new Error('pluginRoot is required in ExecutionContext');
  }
  const basePath = ctx.pluginRoot;
  const schema = await resolveSchema(inputSchemaRef, basePath);
  const validation = validateSchema(input, schema);

  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  return { ok: true };
}

/**
 * Validate output schema
 */
export async function validateOutput(
  manifest: ManifestV2,
  routeOrCommand: string,
  output: unknown,
  handlerRef: HandlerRef,
  ctx?: ExecutionContext
): Promise<{ ok: boolean; errors?: z.ZodError }> {
  // Find route or command
  const handlerRefStr = `${handlerRef.file}#${handlerRef.export}`;
  const restRoute = manifest.rest?.routes.find(
    (r: RestRouteDecl) => r.handler === handlerRefStr
  );
  const cliCommand = manifest.cli?.commands.find(
    (c: CliCommandDecl) => c.handler === handlerRefStr
  );

  const outputSchemaRef = restRoute?.output || undefined;
  if (!outputSchemaRef) {
    return { ok: true };
  }

  // Use pluginRoot from context (required)
  if (!ctx?.pluginRoot) {
    throw new Error('pluginRoot is required in ExecutionContext');
  }
  const basePath = ctx.pluginRoot;
  const schema = await resolveSchema(outputSchemaRef, basePath);
  const validation = validateSchema(output, schema);

  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  return { ok: true };
}


