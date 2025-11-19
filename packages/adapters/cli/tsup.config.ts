import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: {
    index: 'src/index.ts',
  },
  external: [
    '@kb-labs/plugin-manifest',
    '@kb-labs/plugin-runtime',
    '@kb-labs/sandbox',
    '@kb-labs/cli-core',
    '@kb-labs/api-contracts',
  ],
  tsconfig: './tsconfig.json',
  dts: {
    resolve: true,
  },
})
