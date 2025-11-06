import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  entry: {
    index: 'src/index.ts',
  },
  external: [
    '@kb-labs/plugin-manifest',
    '@kb-labs/plugin-runtime',
    '@kb-labs/api-contracts',
    '@kb-labs/analytics-sdk-node',
    'fastify',
    'minimatch',
    'zod',
    'zod-to-openapi',
  ],
  tsconfig: './tsconfig.json',
  dts: {
    resolve: true,
    compilerOptions: {
      moduleResolution: 'bundler',
    },
  },
})
