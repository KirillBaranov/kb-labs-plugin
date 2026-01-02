import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: {
    index: 'src/index.ts',
    'http/index': 'src/http/index.ts',
    // TODO: worker-script needs type fixes before including in build
    // 'backends/worker-pool/worker-script': 'src/backends/worker-pool/worker-script.ts',
  },
  external: ['fastify', '@kb-labs/core-runtime'],
});
