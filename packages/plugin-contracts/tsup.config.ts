import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node.js'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: {
    index: 'src/index.ts',
    shell: 'src/shell/index.ts',
    artifacts: 'src/artifacts/index.ts',
    invoke: 'src/invoke/index.ts',
  },
  external: [],
})

