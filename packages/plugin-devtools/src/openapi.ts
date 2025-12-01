/**
 * @module @kb-labs/plugin-devtools/openapi
 * OpenAPI codegen from manifests
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { generateOpenAPI as generateOpenAPISpec } from '@kb-labs/plugin-adapter-rest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Generate OpenAPI spec for a single plugin
 */
export async function generateOpenAPIFile(
  manifest: ManifestV2,
  outputPath: string
): Promise<void> {
  const spec = generateOpenAPISpec(manifest);

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Write spec
  await fs.writeFile(outputPath, JSON.stringify(spec, null, 2), 'utf8');
}

/**
 * Generate OpenAPI specs for multiple plugins
 */
export async function generateOpenAPIs(
  manifests: ManifestV2[],
  outputDir: string = 'dist/openapi'
): Promise<Record<string, string>> {
  const generated: Record<string, string> = {};

  for (const manifest of manifests) {
    const outputPath = path.join(outputDir, `${manifest.id}.json`);
    await generateOpenAPIFile(manifest, outputPath);
    generated[manifest.id] = outputPath;
  }

  return generated;
}

/**
 * Merge multiple OpenAPI specs into one
 */
export async function mergeOpenAPIs(
  manifests: ManifestV2[],
  outputPath: string
): Promise<void> {
  const specs = manifests.map((m) => generateOpenAPISpec(m));

  // Merge specs
  const merged: any = {
    openapi: '3.0.0',
    info: {
      title: 'KB Labs Plugin API',
      version: '1.0.0',
      description: 'Merged OpenAPI specs from all plugins',
    },
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {},
    },
  };

  for (const spec of specs) {
    // Merge paths
    Object.assign(merged.paths, spec.paths);

    // Merge components
    if (spec.components?.schemas) {
      Object.assign(merged.components.schemas, spec.components.schemas);
    }
    if (spec.components?.securitySchemes) {
      Object.assign(merged.components.securitySchemes, spec.components.securitySchemes);
    }
  }

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Write merged spec
  await fs.writeFile(outputPath, JSON.stringify(merged, null, 2), 'utf8');
}
