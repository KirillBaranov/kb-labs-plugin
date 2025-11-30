#!/usr/bin/env node
/**
 * @file Codemod script for migrating plugin context from legacy to new API
 *
 * Usage:
 *   pnpm tsx scripts/migrate-plugin-context.ts <file-or-directory>
 *
 * Examples:
 *   pnpm tsx scripts/migrate-plugin-context.ts ./plugins/my-plugin/handler.ts
 *   pnpm tsx scripts/migrate-plugin-context.ts ./plugins
 *
 * What it does:
 *   - Replaces ctx.runtime.logger.* with ctx.output.*
 *   - Replaces ctx.runtime.log() with ctx.output.*
 *   - Replaces ctx.runtime.invoke with ctx.api.invoke
 *   - Replaces ctx.runtime.state with ctx.api.state
 *   - Replaces ctx.runtime.events with ctx.api.events
 *   - Replaces ctx.runtime.artifacts with ctx.api.artifacts
 *   - Replaces ctx.runtime.shell with ctx.api.shell
 *   - Replaces ctx.runtime.analytics with ctx.api.analytics
 *   - Removes unnecessary optional chaining (?.) from new APIs
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

interface MigrationStats {
  filesScanned: number;
  filesModified: number;
  transformsApplied: number;
  errors: Array<{ file: string; error: string }>;
}

const stats: MigrationStats = {
  filesScanned: 0,
  filesModified: 0,
  transformsApplied: 0,
  errors: []
};

/**
 * Migration transforms - order matters!
 */
const transforms = [
  // 1. Logger methods (most common)
  {
    name: 'ctx.runtime.logger.* → ctx.output.*',
    pattern: /ctx\.runtime\.logger\.(debug|info|warn|error)\(/g,
    replacement: 'ctx.output.$1('
  },

  // 2. Legacy log() function
  {
    name: 'ctx.runtime.log() → ctx.output.*',
    pattern: /ctx\.runtime\.log\(['"]debug['"],\s*/g,
    replacement: 'ctx.output.debug('
  },
  {
    name: 'ctx.runtime.log() → ctx.output.*',
    pattern: /ctx\.runtime\.log\(['"]info['"],\s*/g,
    replacement: 'ctx.output.info('
  },
  {
    name: 'ctx.runtime.log() → ctx.output.*',
    pattern: /ctx\.runtime\.log\(['"]warn['"],\s*/g,
    replacement: 'ctx.output.warn('
  },
  {
    name: 'ctx.runtime.log() → ctx.output.*',
    pattern: /ctx\.runtime\.log\(['"]error['"],\s*/g,
    replacement: 'ctx.output.error('
  },

  // 3. Invoke
  {
    name: 'ctx.runtime.invoke → ctx.api.invoke',
    pattern: /ctx\.runtime\.invoke/g,
    replacement: 'ctx.api.invoke'
  },

  // 4. State (with optional chaining)
  {
    name: 'ctx.runtime.state?. → ctx.api.state.',
    pattern: /ctx\.runtime\.state\?\./g,
    replacement: 'ctx.api.state.'
  },
  {
    name: 'ctx.runtime.state. → ctx.api.state.',
    pattern: /ctx\.runtime\.state\./g,
    replacement: 'ctx.api.state.'
  },

  // 5. Events (with optional chaining)
  {
    name: 'ctx.runtime.events?. → ctx.api.events.',
    pattern: /ctx\.runtime\.events\?\./g,
    replacement: 'ctx.api.events.'
  },
  {
    name: 'ctx.runtime.events. → ctx.api.events.',
    pattern: /ctx\.runtime\.events\./g,
    replacement: 'ctx.api.events.'
  },

  // 6. Artifacts
  {
    name: 'ctx.runtime.artifacts. → ctx.api.artifacts.',
    pattern: /ctx\.runtime\.artifacts\./g,
    replacement: 'ctx.api.artifacts.'
  },

  // 7. Shell
  {
    name: 'ctx.runtime.shell. → ctx.api.shell.',
    pattern: /ctx\.runtime\.shell\./g,
    replacement: 'ctx.api.shell.'
  },

  // 8. Analytics
  {
    name: 'ctx.runtime.analytics → ctx.api.analytics',
    pattern: /ctx\.runtime\.analytics/g,
    replacement: 'ctx.api.analytics'
  },

  // 9. Config (special case - API changed)
  // We just flag this for manual review
];

/**
 * Transform a single file
 */
function transformFile(filePath: string, dryRun: boolean = false): boolean {
  stats.filesScanned++;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    let modified = content;
    let fileTransformCount = 0;

    // Apply all transforms
    for (const transform of transforms) {
      const before = modified;
      modified = modified.replace(transform.pattern, transform.replacement);

      if (before !== modified) {
        fileTransformCount++;
        stats.transformsApplied++;
        console.log(`  ✓ ${transform.name}`);
      }
    }

    // Check for config API (needs manual review)
    if (modified.includes('ctx.runtime.config') || modified.includes('ctx.api.config')) {
      console.log(`  ⚠️  Manual review needed: config API signature changed`);
      console.log(`     Old: ctx.runtime.config.ensureSection(ptr, value, opts)`);
      console.log(`     New: ctx.api.config.ensureSection(section).ensureSection(ptr, value, opts)`);
    }

    // Only write if changes were made
    if (content !== modified) {
      if (!dryRun) {
        fs.writeFileSync(filePath, modified, 'utf-8');
      }
      stats.filesModified++;
      return true;
    }

    return false;
  } catch (error) {
    stats.errors.push({
      file: filePath,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}

/**
 * Process a directory recursively
 */
async function processPath(targetPath: string, dryRun: boolean = false): Promise<void> {
  const absolutePath = path.resolve(targetPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`❌ Path does not exist: ${absolutePath}`);
    process.exit(1);
  }

  const stat = fs.statSync(absolutePath);

  if (stat.isFile()) {
    // Single file
    if (absolutePath.endsWith('.ts') || absolutePath.endsWith('.tsx')) {
      console.log(`\n📝 Processing: ${absolutePath}`);
      const modified = transformFile(absolutePath, dryRun);
      if (modified) {
        console.log(`  ✅ Modified`);
      } else {
        console.log(`  ⏭️  No changes needed`);
      }
    } else {
      console.log(`⏭️  Skipping non-TypeScript file: ${absolutePath}`);
    }
  } else if (stat.isDirectory()) {
    // Directory - find all .ts and .tsx files
    console.log(`\n📂 Scanning directory: ${absolutePath}`);

    const files = await glob('**/*.{ts,tsx}', {
      cwd: absolutePath,
      ignore: ['**/node_modules/**', '**/dist/**', '**/*.d.ts'],
      absolute: true
    });

    console.log(`Found ${files.length} TypeScript files\n`);

    for (const file of files) {
      console.log(`📝 Processing: ${path.relative(process.cwd(), file)}`);
      const modified = transformFile(file, dryRun);
      if (modified) {
        console.log(`  ✅ Modified`);
      } else {
        console.log(`  ⏭️  No changes needed`);
      }
    }
  }
}

/**
 * Print summary
 */
function printSummary(dryRun: boolean): void {
  console.log('\n' + '='.repeat(60));
  console.log(`📊 Migration Summary ${dryRun ? '(DRY RUN)' : ''}`);
  console.log('='.repeat(60));
  console.log(`Files scanned:      ${stats.filesScanned}`);
  console.log(`Files modified:     ${stats.filesModified}`);
  console.log(`Transforms applied: ${stats.transformsApplied}`);
  console.log(`Errors:             ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const error of stats.errors) {
      console.log(`  - ${error.file}: ${error.error}`);
    }
  }

  if (dryRun && stats.filesModified > 0) {
    console.log('\n💡 This was a dry run. Run without --dry-run to apply changes.');
  }

  if (!dryRun && stats.filesModified > 0) {
    console.log('\n✅ Migration complete!');
    console.log('\n📋 Next steps:');
    console.log('  1. Review changes with git diff');
    console.log('  2. Run TypeScript: pnpm run typecheck');
    console.log('  3. Run tests: pnpm run test');
    console.log('  4. Check for manual config API migrations');
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Plugin Context Migration Tool
==============================

Automatically migrates plugin handlers from legacy ctx.runtime API to new ctx.api/ctx.output API.

Usage:
  pnpm tsx scripts/migrate-plugin-context.ts [options] <path>

Arguments:
  <path>          File or directory to migrate

Options:
  --dry-run       Show what would be changed without modifying files
  --help, -h      Show this help message

Examples:
  # Migrate a single file
  pnpm tsx scripts/migrate-plugin-context.ts ./plugins/my-plugin/handler.ts

  # Migrate entire directory
  pnpm tsx scripts/migrate-plugin-context.ts ./plugins

  # Dry run (preview changes)
  pnpm tsx scripts/migrate-plugin-context.ts --dry-run ./plugins

Transforms applied:
  - ctx.runtime.logger.*  → ctx.output.*
  - ctx.runtime.log()     → ctx.output.*
  - ctx.runtime.invoke    → ctx.api.invoke
  - ctx.runtime.state     → ctx.api.state
  - ctx.runtime.events    → ctx.api.events
  - ctx.runtime.artifacts → ctx.api.artifacts
  - ctx.runtime.shell     → ctx.api.shell
  - ctx.runtime.analytics → ctx.api.analytics

Note: config API requires manual migration (signature changed)
`);
    process.exit(0);
  }

  const dryRun = args.includes('--dry-run');
  const targetPath = args.filter(arg => !arg.startsWith('--'))[0];

  if (!targetPath) {
    console.error('❌ No path specified');
    process.exit(1);
  }

  console.log('🚀 KB Labs Plugin Context Migration Tool');
  console.log('=========================================\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  }

  await processPath(targetPath, dryRun);
  printSummary(dryRun);

  if (stats.errors.length > 0) {
    process.exit(1);
  }
}

// Run
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
