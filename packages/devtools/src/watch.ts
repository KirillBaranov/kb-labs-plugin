/**
 * @module @kb-labs/plugin-devtools/watch
 * File watcher for dev mode registry regeneration
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { watch } from 'node:fs';
import { generateStudioRegistry } from './registry';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

/**
 * Watch for manifest changes and regenerate registry
 */
export async function watchManifests(
  manifestPaths: string[],
  outputPath: string = 'dist/studio/registry.json',
  onChanged?: (changedFiles: string[]) => void
): Promise<() => void> {
  let debounceTimer: NodeJS.Timeout | null = null;
  const changedFiles = new Set<string>();

  const debounceMs = 250; // 200-300ms as specified

  const regenerate = async () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    debounceTimer = setTimeout(async () => {
      const files = Array.from(changedFiles);
      changedFiles.clear();

      try {
        // Load manifests
        const manifests: ManifestV2[] = [];
        for (const manifestPath of manifestPaths) {
          try {
            const content = await fs.readFile(manifestPath, 'utf8');
            // Dynamic import for TypeScript/ESM modules
            const manifestModule = await import(path.resolve(manifestPath));
            const manifest = manifestModule.manifest || manifestModule.default;
            if (manifest) {
              manifests.push(manifest);
            }
          } catch (e) {
            console.warn(`[plugin-devtools] Failed to load manifest ${manifestPath}:`, e);
          }
        }

        // Regenerate registry
        await generateStudioRegistry(manifests, outputPath);

        // Log changed plugins
        if (files.length > 0) {
          console.log(`[plugin-devtools] Regenerated registry (changed: ${files.map(f => path.basename(f)).join(', ')})`);
          onChanged?.(files);
        }
      } catch (e) {
        console.error('[plugin-devtools] Failed to regenerate registry:', e);
      }
    }, debounceMs);
  };

  // Watch all manifest files
  const watchers: Array<{ close: () => void }> = [];

  for (const manifestPath of manifestPaths) {
    try {
      const watcher = watch(manifestPath, async (eventType) => {
        if (eventType === 'change') {
          changedFiles.add(manifestPath);
          await regenerate();
        }
      });

      watchers.push({
        close: () => {
          try {
            watcher.close();
          } catch (e) {
            // Ignore close errors
          }
        },
      });

      console.log(`[plugin-devtools] Watching: ${manifestPath}`);
    } catch (e) {
      console.warn(`[plugin-devtools] Failed to watch ${manifestPath}:`, e);
    }
  }

  // Initial generation
  await regenerate();

  // Return cleanup function
  return () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}


