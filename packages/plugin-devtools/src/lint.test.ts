/**
 * @module @kb-labs/plugin-devtools/lint.test
 * Tests for manifest linting, focusing on command example validation
 */

import { describe, it, expect } from 'vitest';
import { lintManifest } from './lint';
import type { ManifestV2 } from '@kb-labs/plugin-manifest';

describe('lintManifest - validateCommandExamples', () => {
  const baseManifest: ManifestV2 = {
    schema: 'kb.plugin/2',
    id: '@kb-labs/test-plugin',
    version: '1.0.0',
    name: 'Test Plugin',
    group: 'test',
  };

  describe('missing examples', () => {
    it('should warn when command has no examples', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'hello',
              describe: 'Say hello',
              handler: './hello.js#handler',
              // No examples
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'COMMAND_MISSING_EXAMPLES',
          severity: 'warning',
          location: 'cli.commands[hello].examples',
        })
      );
    });

    it('should warn when command has empty examples array', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'hello',
              describe: 'Say hello',
              handler: './hello.js#handler',
              examples: [],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'COMMAND_MISSING_EXAMPLES',
          severity: 'warning',
        })
      );
    });
  });

  describe('example format validation', () => {
    it('should error when example does not start with correct prefix', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'hello',
              describe: 'Say hello',
              handler: './hello.js#handler',
              examples: ['kb wrong hello', 'hello --name World'],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'EXAMPLE_INVALID_FORMAT',
          severity: 'error',
        })
      );
    });

    it('should pass when example has correct format', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'hello',
              describe: 'Say hello',
              handler: './hello.js#handler',
              examples: ['kb test hello', 'kb test hello --name World'],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      const formatErrors = result.errors.filter((e) => e.code === 'EXAMPLE_INVALID_FORMAT');
      expect(formatErrors).toHaveLength(0);
    });
  });

  describe('flag validation', () => {
    it('should error when example uses unknown flag', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'hello',
              describe: 'Say hello',
              handler: './hello.js#handler',
              flags: [{ name: 'name', type: 'string' }],
              examples: ['kb test hello --unknown-flag value'],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'EXAMPLE_UNKNOWN_FLAG',
          severity: 'error',
        })
      );
    });

    it('should pass when example uses defined flags', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'hello',
              describe: 'Say hello',
              handler: './hello.js#handler',
              flags: [
                { name: 'name', type: 'string' },
                { name: 'json', type: 'boolean' },
              ],
              examples: ['kb test hello --name World', 'kb test hello --name World --json'],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      const unknownFlagErrors = result.errors.filter((e) => e.code === 'EXAMPLE_UNKNOWN_FLAG');
      expect(unknownFlagErrors).toHaveLength(0);
    });
  });

  describe('flag type validation', () => {
    it('should warn when boolean flag has a value', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'hello',
              describe: 'Say hello',
              handler: './hello.js#handler',
              flags: [{ name: 'json', type: 'boolean' }],
              examples: ['kb test hello --json true'], // boolean flags should not have values
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EXAMPLE_FLAG_TYPE_MISMATCH',
          severity: 'warning',
        })
      );
    });

    it('should pass when boolean flag has no value', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'hello',
              describe: 'Say hello',
              handler: './hello.js#handler',
              flags: [{ name: 'json', type: 'boolean' }],
              examples: ['kb test hello --json'],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      const typeMismatchErrors = result.warnings.filter((e) => e.code === 'EXAMPLE_FLAG_TYPE_MISMATCH');
      expect(typeMismatchErrors).toHaveLength(0);
    });
  });

  describe('flag choices validation', () => {
    it('should error when flag value not in allowed choices', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'deploy',
              describe: 'Deploy',
              handler: './deploy.js#handler',
              flags: [{ name: 'env', type: 'string', choices: ['dev', 'staging', 'prod'] }],
              examples: ['kb test deploy --env production'], // 'production' not in choices
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          code: 'EXAMPLE_FLAG_INVALID_CHOICE',
          severity: 'error',
        })
      );
    });

    it('should pass when flag value is in allowed choices', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'deploy',
              describe: 'Deploy',
              handler: './deploy.js#handler',
              flags: [{ name: 'env', type: 'string', choices: ['dev', 'staging', 'prod'] }],
              examples: ['kb test deploy --env dev', 'kb test deploy --env staging'],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      const choiceErrors = result.errors.filter((e) => e.code === 'EXAMPLE_FLAG_INVALID_CHOICE');
      expect(choiceErrors).toHaveLength(0);
    });
  });

  describe('required flags validation', () => {
    it('should warn when example missing required flag', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'deploy',
              describe: 'Deploy',
              handler: './deploy.js#handler',
              flags: [{ name: 'env', type: 'string', required: true }],
              examples: ['kb test deploy'], // missing --env
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          code: 'EXAMPLE_MISSING_REQUIRED_FLAG',
          severity: 'warning',
        })
      );
    });

    it('should pass when example has required flags', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'deploy',
              describe: 'Deploy',
              handler: './deploy.js#handler',
              flags: [{ name: 'env', type: 'string', required: true }],
              examples: ['kb test deploy --env dev'],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      const missingRequiredErrors = result.warnings.filter((e) => e.code === 'EXAMPLE_MISSING_REQUIRED_FLAG');
      expect(missingRequiredErrors).toHaveLength(0);
    });
  });

  describe('quoted values', () => {
    it('should handle quoted flag values correctly', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        cli: {
          commands: [
            {
              id: 'query',
              describe: 'Query',
              handler: './query.js#handler',
              flags: [{ name: 'text', type: 'string' }],
              examples: [
                'kb test query --text "hello world"',
                "kb test query --text 'hello world'",
              ],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      const unknownFlagErrors = result.errors.filter((e) => e.code === 'EXAMPLE_UNKNOWN_FLAG');
      expect(unknownFlagErrors).toHaveLength(0);
    });
  });

  describe('complex realistic examples', () => {
    it('should validate plugins:list command example (ignoring handler errors)', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        group: 'plugins',
        cli: {
          commands: [
            {
              id: 'list',
              describe: 'List plugins',
              handler: './list.js#handler',
              flags: [{ name: 'json', type: 'boolean', description: 'Output JSON' }],
              examples: ['kb plugins list', 'kb plugins list --json'],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      // Filter out handler file errors (we don't have actual files in tests)
      const exampleErrors = result.errors.filter((e) =>
        !e.code.includes('HANDLER_REF') && !e.code.includes('FILE_NOT_FOUND')
      );
      expect(exampleErrors).toHaveLength(0);
    });

    it('should validate mind:rag-query command example (ignoring handler errors)', async () => {
      const manifest: ManifestV2 = {
        ...baseManifest,
        group: 'mind',
        cli: {
          commands: [
            {
              id: 'rag-query',
              describe: 'RAG query',
              handler: './query.js#handler',
              flags: [
                { name: 'text', type: 'string', required: true },
                { name: 'mode', type: 'string', choices: ['instant', 'auto', 'thinking'] },
                { name: 'agent', type: 'boolean' },
              ],
              examples: [
                'kb mind rag-query --text "how does search work" --agent',
                'kb mind rag-query --text "explain architecture" --mode thinking',
              ],
            },
          ],
        },
      };

      const result = await lintManifest(manifest);
      // Filter out handler file errors (we don't have actual files in tests)
      const exampleErrors = result.errors.filter((e) =>
        !e.code.includes('HANDLER_REF') && !e.code.includes('FILE_NOT_FOUND')
      );
      expect(exampleErrors).toHaveLength(0);
    });
  });
});
