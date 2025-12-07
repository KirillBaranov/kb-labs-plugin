import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  dts: true, // Re-enabled after fixing HttpPresenter UIFacade implementation
  entry: {
    index: 'src/index.ts',
  },
  sourcemap: false,
  external: [
    /^@kb-labs\/.*$/,
    '@kb-labs/plugin-manifest',
    '@kb-labs/plugin-runtime',
    '@kb-labs/core-workspace',
    '@kb-labs/core-sandbox',
    '@kb-labs/rest-api-contracts',
    '@kb-labs/analytics-sdk-node',
    'fastify',
    'minimatch',
    'zod',
    'zod-to-openapi',
  ],
})
