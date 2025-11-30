import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
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
    '@kb-labs/api-contracts',
    '@kb-labs/analytics-sdk-node',
    'fastify',
    'minimatch',
    'zod',
    'zod-to-openapi',
  ],
})
