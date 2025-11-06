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
    '@kb-labs/sandbox',
    '@kb-labs/cli-core',
    '@kb-labs/api-contracts',
  ],
  tsconfig: './tsconfig.json',
  dts: {
    resolve: true,
  },
})
