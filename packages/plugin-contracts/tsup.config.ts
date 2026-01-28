import { defineConfig } from 'tsup'
import dualPreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...dualPreset,
  format: ['esm', 'cjs'], // Add CJS for compatibility with bundled CLI
  tsconfig: "tsconfig.build.json",
  entry: {
    index: 'src/index.ts',
  },
  external: ['@kb-labs/studio-contracts', '@kb-labs/core-contracts'],
})
