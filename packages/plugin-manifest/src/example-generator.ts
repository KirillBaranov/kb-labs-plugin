/**
 * @module @kb-labs/plugin-manifest/example-generator
 * Type-safe CLI example generation
 */

/**
 * Example template for type-safe example generation
 */
export interface ExampleTemplate {
  /** Human-readable description (optional, for documentation) */
  description?: string;
  /** Flag values for this example */
  flags: Record<string, string | number | boolean | string[]>;
}

/**
 * Generate CLI examples from templates with full type safety
 *
 * @example
 * const examples = generateExamples('rag-query', 'mind', [
 *   {
 *     description: 'Basic query',
 *     flags: { text: 'summarize monitoring stack' }
 *   },
 *   {
 *     description: 'Query with mode',
 *     flags: { text: 'how does rate limiting work', mode: 'auto' }
 *   }
 * ]);
 * // Returns:
 * // [
 * //   'kb mind rag-query --text "summarize monitoring stack"',
 * //   'kb mind rag-query --text "how does rate limiting work" --mode auto'
 * // ]
 */
export function generateExamples(
  commandId: string,
  group: string,
  templates: ExampleTemplate[]
): string[] {
  const examples: string[] = [];

  for (const template of templates) {
    const parts: string[] = [`kb ${group} ${commandId}`];

    // Sort flags for consistent output (boolean flags last)
    const flagEntries = Object.entries(template.flags);
    const nonBooleanFlags = flagEntries.filter(([_, v]) => typeof v !== 'boolean');
    const booleanFlags = flagEntries.filter(([_, v]) => typeof v === 'boolean' && v === true);

    // Add non-boolean flags first
    for (const [name, value] of nonBooleanFlags) {
      if (Array.isArray(value)) {
        // Array flags: --flag val1 --flag val2
        for (const item of value) {
          parts.push(`--${name} ${formatFlagValue(item)}`);
        }
      } else {
        parts.push(`--${name} ${formatFlagValue(value)}`);
      }
    }

    // Add boolean flags (no value)
    for (const [name] of booleanFlags) {
      parts.push(`--${name}`);
    }

    examples.push(parts.join(' '));
  }

  return examples;
}

/**
 * Format flag value for CLI
 */
function formatFlagValue(value: string | number | boolean): string {
  if (typeof value === 'string') {
    // Quote strings with spaces or special characters
    if (value.includes(' ') || value.includes('"') || value.includes("'")) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  return String(value);
}

/**
 * Type-safe example builder with fluent API (advanced)
 *
 * @example
 * const examples = exampleBuilder('rag-query', 'mind')
 *   .add({ text: 'summarize monitoring stack' })
 *   .add({ text: 'how does rate limiting work', mode: 'auto' })
 *   .add({ text: 'where is auth middleware', agent: true })
 *   .build();
 */
export class ExampleBuilder {
  private templates: ExampleTemplate[] = [];

  constructor(
    private commandId: string,
    private group: string
  ) {}

  add(flags: Record<string, string | number | boolean | string[]>, description?: string): this {
    this.templates.push({ flags, description });
    return this;
  }

  build(): string[] {
    return generateExamples(this.commandId, this.group, this.templates);
  }
}

/**
 * Create a new example builder
 */
export function exampleBuilder(commandId: string, group: string): ExampleBuilder {
  return new ExampleBuilder(commandId, group);
}
