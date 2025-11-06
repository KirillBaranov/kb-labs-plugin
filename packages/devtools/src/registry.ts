/**
 * @module @kb-labs/plugin-devtools/registry
 * Studio registry codegen from manifests
 */

import type { ManifestV2 } from '@kb-labs/plugin-manifest';
import { toRegistry, combineRegistries } from '@kb-labs/plugin-adapter-studio';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Validate widget data source and schema
 */
function validateWidget(widget: NonNullable<ManifestV2['studio']>['widgets'][0]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate data.source
  if (!widget.data?.source) {
    errors.push(`Widget ${widget.id}: missing data.source`);
  } else if (widget.data.source.type === 'rest' && !widget.data.source.routeId) {
    errors.push(`Widget ${widget.id}: rest source missing routeId`);
  } else if (widget.data.source.type === 'mock' && !widget.data.source.fixtureId) {
    errors.push(`Widget ${widget.id}: mock source missing fixtureId`);
  }

  // Validate data.schema
  if (!widget.data?.schema) {
    errors.push(`Widget ${widget.id}: missing data.schema`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate Studio registry from manifests
 */
export async function generateStudioRegistry(
  manifests: ManifestV2[],
  outputPath: string = 'dist/studio/registry.json'
): Promise<void> {
  // Validate all widgets
  const validationErrors: string[] = [];
  for (const manifest of manifests) {
    if (manifest.studio?.widgets) {
      for (const widget of manifest.studio.widgets) {
        const validation = validateWidget(widget);
        if (!validation.valid) {
          validationErrors.push(...validation.errors);
        }
      }
    }
  }

  if (validationErrors.length > 0) {
    console.warn('[plugin-devtools] Widget validation errors:');
    for (const error of validationErrors) {
      console.warn(`  - ${error}`);
    }
  }

  // Generate registries from all manifests
  const registries = manifests.map((m) => toRegistry(m));

  // Combine registries
  const combined = combineRegistries(...registries);

  // Ensure directory exists
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });

  // Write registry
  await fs.writeFile(outputPath, JSON.stringify(combined, null, 2), 'utf8');
  
  console.log(`[plugin-devtools] Generated registry: ${outputPath}`);
  console.log(`[plugin-devtools] Widgets: ${combined.widgets?.length || 0}`);
}
