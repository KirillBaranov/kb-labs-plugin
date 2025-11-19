import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: {
    index: 'src/index.ts',
    'sandbox/child/bootstrap': 'src/sandbox/child/bootstrap.ts',
  },
  external: [
    '@kb-labs/analytics-sdk-node',
    '@kb-labs/api-contracts',
    '@kb-labs/plugin-manifest',
    '@kb-labs/sandbox',
    'minimatch',
    'semver',
    'zod',
  ],
})
