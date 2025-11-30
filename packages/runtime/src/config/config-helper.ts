import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import type {
  Operation,
  OperationId,
  OperationMetadata
} from '@kb-labs/setup-operations';
import type { FSLike } from '../types';
import type { OperationTracker } from '../operations/operation-tracker';

export type ConfigMergeStrategy = 'deep' | 'shallow' | 'replace';

export interface EnsureSectionOptions {
  path?: string;
  strategy?: ConfigMergeStrategy;
  metadata?: Partial<OperationMetadata>;
}

export interface EnsureSectionResult {
  changed: boolean;
  path: string;
  pointer: string;
  previous?: unknown;
  next: unknown;
  operationId?: OperationId;
}

interface ConfigHelperDeps {
  workdir: string;
  fs: FSLike;
  tracker?: OperationTracker;
  defaultConfigPath?: string;
}

export class SmartConfigHelper {
  private readonly workdir: string;
  private readonly fs: FSLike;
  private readonly tracker?: OperationTracker;
  private readonly defaultConfigPath: string;

  constructor({ workdir, fs, tracker, defaultConfigPath = '.kb/kb-labs.config.json' }: ConfigHelperDeps) {
    this.workdir = workdir;
    this.fs = fs;
    this.tracker = tracker;
    this.defaultConfigPath = defaultConfigPath;
  }

  async ensureSection(
    pointer: string,
    value: unknown,
    options: EnsureSectionOptions = {}
  ): Promise<EnsureSectionResult> {
    const configPath = options.path ?? this.defaultConfigPath;
    const strategy: ConfigMergeStrategy = options.strategy ?? 'deep';
    const pointerSegments = parsePointer(pointer);
    const jsonPointer = toJsonPointer(pointerSegments);

    const currentConfig = await this.readConfig(configPath);
    const clonedConfig = clone(currentConfig);
    const currentValue = getAt(clonedConfig, pointerSegments);

    const nextValue = computeNextValue(currentValue, value, strategy);
    const changed = !isDeepStrictEqual(currentValue, nextValue);

    const operation: Operation = {
      kind: 'config',
      action: strategy === 'replace' ? 'set' : strategy === 'shallow' ? 'merge' : 'merge',
      path: configPath,
      pointer: jsonPointer,
      value: clone(value),
      strategy
    };

    const recordId = this.recordOperation(operation, jsonPointer, configPath, {
      changed,
      metadata: options.metadata,
      previous: currentValue,
      next: nextValue
    });

    if (!changed) {
      return {
        changed: false,
        path: configPath,
        pointer: jsonPointer,
        previous: currentValue,
        next: nextValue,
        operationId: recordId
      };
    }

    setAt(clonedConfig, pointerSegments, nextValue);

    const serialized = `${JSON.stringify(clonedConfig, null, 2)}\n`;

    try {
      const dirName = path.dirname(configPath);
      if (dirName && dirName !== '.') {
        await this.fs.mkdir(dirName, { recursive: true });
      }
      await this.fs.writeFile(configPath, serialized, { encoding: 'utf8' });
      if (recordId) {
        this.tracker?.markApplied(recordId);
      }
    } catch (error) {
      if (recordId) {
        this.tracker?.markFailed(recordId, error instanceof Error ? error.message : String(error));
      }
      throw error;
    }

    return {
      changed: true,
      path: configPath,
      pointer: jsonPointer,
      previous: currentValue,
      next: nextValue,
      operationId: recordId
    };
  }

  private async readConfig(configPath: string): Promise<any> {
    try {
      const raw = await this.fs.readFile(configPath, { encoding: 'utf8' });
      const content = typeof raw === 'string' ? raw : raw.toString('utf8');
      if (!content.trim()) {
        return {};
      }
      return JSON.parse(content);
    } catch (error) {
      if (isFileNotFound(error)) {
        return {};
      }

      const resolved = path.resolve(this.workdir, configPath);
      throw new Error(`Failed to read config at ${resolved}: ${getErrorMessage(error)}`);
    }
  }

  private recordOperation(
    operation: Operation,
    pointer: string,
    configPath: string,
    options: {
      changed: boolean;
      metadata?: Partial<OperationMetadata>;
      previous: unknown;
      next: unknown;
    }
  ): OperationId | undefined {
    if (!this.tracker) {
      return undefined;
    }

    const annotations = {
      path: configPath,
      pointer,
      changed: options.changed,
      previousSnapshot: options.changed ? undefined : options.previous,
      relativePath: toWorkspaceRelative(configPath, this.workdir)
    } satisfies Record<string, unknown>;

    const metadata = this.tracker.createMetadata('config', `Ensure config section ${pointer}`, {
      ...options.metadata,
      annotations: {
        ...annotations,
        ...(options.metadata?.annotations ?? {})
      },
      tags: options.metadata?.tags
        ? Array.from(new Set(['config', ...options.metadata.tags]))
        : ['config']
    });

    return this.tracker.track(operation, metadata, {
      status: options.changed ? 'pending' : 'skipped',
      reason: options.changed ? undefined : 'no-op'
    });
  }
}

function parsePointer(pointer: string): string[] {
  if (!pointer || pointer === '/') {
    return [];
  }

  if (pointer.startsWith('/')) {
    return pointer
      .split('/')
      .slice(1)
      .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
      .filter((segment) => segment.length > 0);
  }

  const normalized = pointer.replace(/\./g, '/');
  return normalized
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function toJsonPointer(segments: string[]): string {
  if (segments.length === 0) {
    return '/';
  }

  return `/${segments.map((segment) => segment.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
}

function computeNextValue(
  current: unknown,
  candidate: unknown,
  strategy: ConfigMergeStrategy
): unknown {
  if (strategy === 'replace') {
    return clone(candidate);
  }

  if (strategy === 'shallow') {
    if (isPlainObject(current) && isPlainObject(candidate)) {
      return { ...clone(current), ...clone(candidate) };
    }
    return clone(candidate);
  }

  if (isPlainObject(current) && isPlainObject(candidate)) {
    return deepMerge(clone(current), candidate);
  }

  return clone(candidate);
}

function getAt(target: any, segments: string[]): unknown {
  let cursor: any = target;
  for (const segment of segments) {
    if (cursor == null) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function setAt(target: any, segments: string[], value: unknown): void {
  if (segments.length === 0) {
    throw new Error('Cannot set config root to a non-object value');
  }

  let cursor: any = target;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i]!;
    if (!isPlainObject(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  const finalSegment = segments[segments.length - 1];
  if (finalSegment == null || finalSegment === '') {
    throw new Error('Config pointer must resolve to a nested property');
  }
  cursor[finalSegment] = value;
}

function deepMerge(target: any, source: any): any {
  const result: any = Array.isArray(target) ? [...target] : { ...target };

  for (const [key, value] of Object.entries(source ?? {})) {
    if (isPlainObject(result[key]) && isPlainObject(value)) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = clone(value);
    }
  }

  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

type StructuredCloneLike = <T>(value: T) => T;

function clone<T>(value: T): T {
  const globalClone = (globalThis as { structuredClone?: StructuredCloneLike }).structuredClone;
  if (globalClone) {
    return globalClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function toWorkspaceRelative(filePath: string, workdir: string): string {
  const resolved = path.resolve(workdir, filePath);
  const relative = path.relative(workdir, resolved);
  const normalized = relative === '' ? '.' : relative;
  return normalized.split(path.sep).join('/');
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
