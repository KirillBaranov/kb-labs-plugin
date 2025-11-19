/**
 * @module @kb-labs/plugin-runtime/invoke/header-transforms
 * Built-in header value transformation helpers.
 */

type TransformFn = (value: string, param?: string) => string;

const BUILTIN_TRANSFORMS: Record<string, TransformFn> = {
  trim: (value) => value.trim(),
  lowercase: (value) => value.toLowerCase(),
  uppercase: (value) => value.toUpperCase(),
  'collapse-whitespace': (value) => value.replace(/\s+/g, ' ').trim(),
  'normalize-bearer': (value) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return '';
    }
    const bearerMatch = trimmed.match(/^bearer\s+/i);
    if (bearerMatch) {
      const token = trimmed.slice(bearerMatch[0].length).trim();
      return token ? `Bearer ${token}` : '';
    }
    return `Bearer ${trimmed}`;
  },
  'strip-prefix': (value, param) => {
    if (!param) {
      return value;
    }
    return value.startsWith(param) ? value.slice(param.length) : value;
  },
  'strip-suffix': (value, param) => {
    if (!param) {
      return value;
    }
    return value.endsWith(param) ? value.slice(0, value.length - param.length) : value;
  },
};

function parseSegment(segment: string): { name: string; param?: string } {
  const trimmed = segment.trim();
  if (trimmed === '') {
    return { name: '' };
  }
  const parts = trimmed.split(':');
  const name = (parts.shift() ?? '').trim();
  const param = parts.length > 0 ? parts.join(':').trim() : undefined;
  return { name, param };
}

export interface HeaderTransformOptions {
  header?: string;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Apply a pipeline of header transforms defined by a spec string.
 * Examples:
 *  - 'trim|lowercase'
 *  - 'normalize-bearer'
 *  - 'strip-prefix:X-Key-|trim'
 */
export function applyHeaderTransforms(
  spec: string,
  values: string[],
  options: HeaderTransformOptions = {}
): string[] {
  if (!spec || values.length === 0) {
    return values;
  }

  const pipeline = spec
    .split('|')
    .map((segment) => parseSegment(segment))
    .filter((segment) => segment.name.length > 0);

  if (pipeline.length === 0) {
    return values;
  }

  let currentValues = [...values];

  for (const step of pipeline) {
    const transform = BUILTIN_TRANSFORMS[step.name];
    if (!transform) {
      options.warn?.('Unknown header transform', {
        transform: step.name,
        header: options.header,
      });
      continue;
    }

    currentValues = currentValues
      .map((value) => transform(value, step.param))
      .filter((value): value is string => value !== undefined && value !== null);
  }

  return currentValues;
}

export function listHeaderTransforms(): string[] {
  return Object.keys(BUILTIN_TRANSFORMS).sort();
}

