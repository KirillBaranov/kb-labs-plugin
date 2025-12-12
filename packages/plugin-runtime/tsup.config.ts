import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  dts: true, // Re-enabled - circular dependency fixed
  entry: {
    index: 'src/index.ts',
    'sandbox/child/bootstrap': 'src/sandbox/child/bootstrap.ts',
  },
  external: [
    '@kb-labs/analytics-sdk-node',
    '@kb-labs/rest-api-contracts',
    '@kb-labs/plugin-manifest',
    '@kb-labs/core-sandbox',
    'minimatch',
    'semver',
    'zod',
  ],
})
