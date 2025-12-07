import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: {
    index: 'src/index.ts',
  },
  // Override nodePreset's automatic external list
  // Don't externalize workspace packages - let them be bundled
  // so cli-bin can bundle everything properly
  external: [],
  noExternal: [/.*/], // Bundle everything including workspace packages
  dts: {
    resolve: true,
  },
})
