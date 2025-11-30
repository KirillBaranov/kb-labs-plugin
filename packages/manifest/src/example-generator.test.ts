/**
 * @module @kb-labs/plugin-manifest/example-generator.test
 * Tests for type-safe CLI example generation
 */

import { describe, it, expect } from 'vitest';
import { generateExamples, exampleBuilder, ExampleBuilder } from './example-generator';

describe('generateExamples', () => {
  describe('basic functionality', () => {
    it('should generate simple command without flags', () => {
      const examples = generateExamples('list', 'plugins', [{ flags: {} }]);

      expect(examples).toEqual(['kb plugins list']);
    });

    it('should generate command with single string flag', () => {
      const examples = generateExamples('deploy', 'app', [{ flags: { env: 'production' } }]);

      expect(examples).toEqual(['kb app deploy --env production']);
    });

    it('should generate command with boolean flag', () => {
      const examples = generateExamples('list', 'plugins', [{ flags: { json: true } }]);

      expect(examples).toEqual(['kb plugins list --json']);
    });

    it('should generate command with number flag', () => {
      const examples = generateExamples('run', 'worker', [{ flags: { concurrency: 4 } }]);

      expect(examples).toEqual(['kb worker run --concurrency 4']);
    });

    it('should generate command with multiple flags', () => {
      const examples = generateExamples('deploy', 'app', [
        { flags: { env: 'staging', region: 'us-east-1', verbose: true } },
      ]);

      expect(examples).toEqual(['kb app deploy --env staging --region us-east-1 --verbose']);
    });
  });

  describe('flag ordering', () => {
    it('should put non-boolean flags before boolean flags', () => {
      const examples = generateExamples('query', 'mind', [
        { flags: { agent: true, text: 'search query', mode: 'auto' } },
      ]);

      // Boolean flag --agent should come last
      expect(examples).toEqual(['kb mind query --text "search query" --mode auto --agent']);
    });

    it('should maintain consistent ordering for multiple boolean flags', () => {
      const examples = generateExamples('test', 'cmd', [
        { flags: { verbose: true, json: true, watch: true, name: 'test' } },
      ]);

      // name (string) should come first, then boolean flags
      expect(examples[0]).toMatch(/^kb cmd test --name test/);
      expect(examples[0]).toContain('--verbose');
      expect(examples[0]).toContain('--json');
      expect(examples[0]).toContain('--watch');
    });
  });

  describe('quoted values', () => {
    it('should quote strings with spaces', () => {
      const examples = generateExamples('query', 'mind', [
        { flags: { text: 'how does search work' } },
      ]);

      expect(examples).toEqual(['kb mind query --text "how does search work"']);
    });

    it('should escape quotes in string values', () => {
      const examples = generateExamples('echo', 'cmd', [
        { flags: { message: 'say "hello" world' } },
      ]);

      expect(examples).toEqual(['kb cmd echo --message "say \\"hello\\" world"']);
    });

    it('should not quote simple strings', () => {
      const examples = generateExamples('get', 'resource', [{ flags: { id: 'user123' } }]);

      expect(examples).toEqual(['kb resource get --id user123']);
    });
  });

  describe('array flags', () => {
    it('should repeat flag for each array value', () => {
      const examples = generateExamples('install', 'pkg', [
        { flags: { plugin: ['plugin-a', 'plugin-b', 'plugin-c'] } },
      ]);

      expect(examples).toEqual([
        'kb pkg install --plugin plugin-a --plugin plugin-b --plugin plugin-c',
      ]);
    });

    it('should quote array values with spaces', () => {
      const examples = generateExamples('enable', 'plugins', [
        { flags: { perm: ['fs.write', 'net.fetch', 'db.query tables'] } },
      ]);

      expect(examples).toEqual([
        'kb plugins enable --perm fs.write --perm net.fetch --perm "db.query tables"',
      ]);
    });

    it('should handle mixed array and single flags', () => {
      const examples = generateExamples('build', 'app', [
        { flags: { include: ['src', 'tests'], exclude: 'node_modules', minify: true } },
      ]);

      expect(examples).toEqual([
        'kb app build --include src --include tests --exclude node_modules --minify',
      ]);
    });
  });

  describe('multiple examples', () => {
    it('should generate multiple examples from templates', () => {
      const examples = generateExamples('list', 'plugins', [
        { flags: {} },
        { flags: { json: true } },
        { flags: { plugin: 'specific-plugin' } },
      ]);

      expect(examples).toEqual([
        'kb plugins list',
        'kb plugins list --json',
        'kb plugins list --plugin specific-plugin',
      ]);
    });

    it('should handle complex multi-example scenarios', () => {
      const examples = generateExamples('query', 'mind', [
        { flags: { text: 'simple query' } },
        { flags: { text: 'detailed query', mode: 'thinking' } },
        { flags: { text: 'agent query', agent: true } },
      ]);

      expect(examples).toEqual([
        'kb mind query --text "simple query"',
        'kb mind query --text "detailed query" --mode thinking',
        'kb mind query --text "agent query" --agent',
      ]);
    });
  });

  describe('edge cases', () => {
    it('should handle empty flag object', () => {
      const examples = generateExamples('help', 'cmd', [{ flags: {} }]);

      expect(examples).toEqual(['kb cmd help']);
    });

    it('should handle false boolean values (should not include flag)', () => {
      const examples = generateExamples('run', 'test', [{ flags: { verbose: false } }]);

      // false boolean values should not appear in output
      expect(examples).toEqual(['kb test run']);
    });

    it('should handle numeric zero', () => {
      const examples = generateExamples('set', 'config', [{ flags: { timeout: 0 } }]);

      expect(examples).toEqual(['kb config set --timeout 0']);
    });

    it('should handle empty string values', () => {
      const examples = generateExamples('set', 'config', [{ flags: { value: '' } }]);

      // Empty strings are treated as simple strings, no quotes needed
      expect(examples).toEqual(['kb config set --value ']);
    });
  });

  describe('real-world examples', () => {
    it('should generate plugins:list examples', () => {
      const examples = generateExamples('list', 'plugins', [
        { flags: {} },
        { flags: { json: true } },
      ]);

      expect(examples).toEqual(['kb plugins list', 'kb plugins list --json']);
    });

    it('should generate plugins:doctor examples', () => {
      const examples = generateExamples('doctor', 'plugins', [
        { flags: {} },
        { flags: { json: true } },
      ]);

      expect(examples).toEqual(['kb plugins doctor', 'kb plugins doctor --json']);
    });

    it('should generate plugins:enable examples', () => {
      const examples = generateExamples('enable', 'plugins', [
        { flags: {} },
        { flags: { perm: ['fs.write'] } },
      ]);

      expect(examples).toEqual(['kb plugins enable', 'kb plugins enable --perm fs.write']);
    });

    it('should generate mind:rag-query examples', () => {
      const examples = generateExamples('rag-query', 'mind', [
        { flags: { text: 'how does search work' } },
        { flags: { text: 'explain architecture', mode: 'thinking', agent: true } },
      ]);

      expect(examples).toEqual([
        'kb mind rag-query --text "how does search work"',
        'kb mind rag-query --text "explain architecture" --mode thinking --agent',
      ]);
    });

    it('should generate docs:generate-cli-reference examples', () => {
      const examples = generateExamples('generate-cli-reference', 'docs', [
        { flags: {} },
        { flags: { output: './docs/CLI.md' } },
      ]);

      expect(examples).toEqual([
        'kb docs generate-cli-reference',
        'kb docs generate-cli-reference --output ./docs/CLI.md',
      ]);
    });
  });
});

describe('ExampleBuilder', () => {
  describe('fluent API', () => {
    it('should build examples using fluent API', () => {
      const builder = new ExampleBuilder('query', 'mind');
      const examples = builder
        .add({ text: 'simple query' })
        .add({ text: 'detailed query', mode: 'thinking' })
        .build();

      expect(examples).toEqual([
        'kb mind query --text "simple query"',
        'kb mind query --text "detailed query" --mode thinking',
      ]);
    });

    it('should support optional descriptions', () => {
      const builder = new ExampleBuilder('deploy', 'app');
      const examples = builder
        .add({ env: 'dev' }, 'Deploy to development')
        .add({ env: 'prod' }, 'Deploy to production')
        .build();

      expect(examples).toEqual(['kb app deploy --env dev', 'kb app deploy --env prod']);
    });

    it('should allow chaining multiple adds', () => {
      const examples = new ExampleBuilder('test', 'cmd')
        .add({})
        .add({ verbose: true })
        .add({ watch: true })
        .build();

      expect(examples).toEqual(['kb cmd test', 'kb cmd test --verbose', 'kb cmd test --watch']);
    });
  });
});

describe('exampleBuilder', () => {
  it('should create builder instance', () => {
    const builder = exampleBuilder('list', 'plugins');

    expect(builder).toBeInstanceOf(ExampleBuilder);
  });

  it('should work with helper function', () => {
    const examples = exampleBuilder('list', 'plugins')
      .add({})
      .add({ json: true })
      .build();

    expect(examples).toEqual(['kb plugins list', 'kb plugins list --json']);
  });
});
