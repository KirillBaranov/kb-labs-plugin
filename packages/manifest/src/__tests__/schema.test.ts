/**
 * @module @kb-labs/plugin-manifest/__tests__/schema
 * Tests for manifest validation
 */

import { describe, it, expect } from 'vitest';
import { validateManifestV2 } from '../schema.js';
import type { ManifestV2 } from '../types.js';

describe('validateManifestV2', () => {
  it('should validate a valid manifest', () => {
    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: 'ai-review',
      version: '1.2.0',
      display: {
        name: 'AI Review',
        description: 'AI-powered code review',
      },
      capabilities: ['blob.write', 'http.fetch'],
      permissions: {
        fs: { mode: 'read' },
        net: { allowHosts: ['api.openai.com'], timeoutMs: 8_000 },
        env: { allow: ['OPENAI_API_KEY'] },
        quotas: { timeoutMs: 8_000 },
      },
      artifacts: [
        {
          id: 'review-json',
          pathTemplate: 'out/review/{profile}.json',
        },
      ],
      cli: {
        commands: [
          {
            id: 'ai-review:review',
            group: 'ai-review',
            describe: 'Run code review',
            flags: [
              {
                name: 'diff',
                type: 'string',
                required: true,
                description: 'Diff file',
              },
            ],
            handler: './commands/review.js#run',
          },
        ],
      },
    };

    const result = validateManifestV2(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject manifest with missing required fields', () => {
    const manifest = {
      // Missing schema, id, version
      display: { name: 'Test' },
    };

    const result = validateManifestV2(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should reject invalid schema version', () => {
    const manifest = {
      schema: 'kb.plugin/1', // Invalid
      id: 'test',
      version: '1.0.0',
    };

    const result = validateManifestV2(manifest);
    expect(result.valid).toBe(false);
  });

  it('should reject invalid permission spec - empty allowHosts', () => {
    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: 'test',
      version: '1.0.0',
      permissions: {
        net: { allowHosts: [] }, // Empty array when net != 'none'
      },
      cli: {
        commands: [
          {
            id: 'test:run',
            group: 'test',
            describe: 'Run test command',
            flags: [],
            handler: './cli/run.js#execute',
          },
        ],
      },
    };

    const result = validateManifestV2(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should accept valid permission spec - none for net', () => {
    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: 'test',
      version: '1.0.0',
      permissions: {
        fs: { mode: 'read' },
        net: 'none', // Valid
      },
    };

    const result = validateManifestV2(manifest);
    expect(result.valid).toBe(true);
  });

  it('should validate strict union types for fs', () => {
    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: 'test',
      version: '1.0.0',
      permissions: {
        // @ts-expect-error - invalid fs mode value
        fs: { mode: 'invalid' },
      },
    };

    const result = validateManifestV2(manifest);
    expect(result.valid).toBe(false);
  });

  it('should accept manifest with setup section and explicit permissions', () => {
    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: '@kb-labs/ai-review',
      version: '1.0.0',
      setup: {
        handler: './setup/handler.js#run',
        describe: 'Initialize AI Review workspace',
        permissions: {
          fs: {
            mode: 'readWrite',
            allow: ['.kb/ai-review/**'],
            deny: ['.kb/plugins.json'],
          },
          net: 'none',
        },
      },
    };

    const result = validateManifestV2(manifest);
    expect(result.valid).toBe(true);
  });

  it('should reject setup section without fs allow patterns', () => {
    const manifest: ManifestV2 = {
      schema: 'kb.plugin/2',
      id: '@kb-labs/ai-review',
      version: '1.0.0',
      setup: {
        handler: './setup/handler.js#run',
        describe: 'Initialize AI Review workspace',
        permissions: {
          fs: {
            mode: 'readWrite',
            allow: [],
          },
        },
      },
    };

    const result = validateManifestV2(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
