import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  format: ['esm', 'cjs'], // Add CJS for compatibility with bundled CLI
  tsconfig: "tsconfig.build.json",
  entry: {
    index: 'src/index.ts',
  },
  external: [],
})
