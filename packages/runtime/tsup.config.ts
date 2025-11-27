import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  // TODO: Re-enable DTS generation after fixing InvokeRequest/InvokeContext types
  // See: src/invoke/broker.ts for details on type errors
  dts: false, // Temporarily disabled due to type errors in invoke/broker.ts
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
