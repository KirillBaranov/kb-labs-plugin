import type {
  Operation,
  OperationId,
  OperationMetadata,
  OperationWithMetadata
} from '@kb-labs/setup-operations';

export type TrackedOperationStatus = 'pending' | 'applied' | 'skipped' | 'failed';

export interface TrackedOperation extends OperationWithMetadata {
  status: TrackedOperationStatus;
  reason?: string;
  timestamp: number;
}

export interface TrackOperationOptions {
  status?: TrackedOperationStatus;
  reason?: string;
}

export class OperationTracker {
  private readonly order: OperationId[] = [];
  private readonly items = new Map<OperationId, TrackedOperation>();
  private counter = 0;

  get size(): number {
    return this.order.length;
  }

  track(
    operation: Operation,
    metadata: OperationMetadata,
    options: TrackOperationOptions = {}
  ): OperationId {
    const record: TrackedOperation = {
      operation,
      metadata,
      status: options.status ?? 'pending',
      reason: options.reason,
      timestamp: Date.now()
    };

    this.set(record);
    return record.metadata.id;
  }

  record(entry: OperationWithMetadata, options: TrackOperationOptions = {}): OperationId {
    return this.track(entry.operation, entry.metadata, options);
  }

  markApplied(id: OperationId): void {
    this.updateStatus(id, 'applied');
  }

  markSkipped(id: OperationId, reason?: string): void {
    this.updateStatus(id, 'skipped', reason);
  }

  markFailed(id: OperationId, reason?: string): void {
    this.updateStatus(id, 'failed', reason);
  }

  has(id: OperationId): boolean {
    return this.items.has(id);
  }

  get(id: OperationId): TrackedOperation | undefined {
    const record = this.items.get(id);
    return record ? { ...record, metadata: { ...record.metadata } } : undefined;
  }

  /**
   * Return operations in the order they were captured.
   */
  toArray(): TrackedOperation[] {
    return this.order
      .map((id) => this.items.get(id))
      .filter((value): value is TrackedOperation => Boolean(value))
      .map((record) => ({
        ...record,
        metadata: { ...record.metadata }
      }));
  }

  clear(): void {
    this.items.clear();
    this.order.splice(0, this.order.length);
    this.counter = 0;
  }

  generateId(prefix = 'op'): OperationId {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  createMetadata(
    prefix: string,
    fallbackDescription: string,
    overrides: Partial<OperationMetadata> = {}
  ): OperationMetadata {
    return {
      id: overrides.id ?? this.generateId(prefix),
      description: overrides.description ?? fallbackDescription,
      idempotent: overrides.idempotent ?? true,
      reversible: overrides.reversible ?? true,
      dependencies: overrides.dependencies
        ? [...overrides.dependencies]
        : undefined,
      tags: overrides.tags ? [...overrides.tags] : undefined,
      annotations: overrides.annotations ? { ...overrides.annotations } : undefined
    } satisfies OperationMetadata;
  }

  private set(record: TrackedOperation): void {
    if (!this.items.has(record.metadata.id)) {
      this.order.push(record.metadata.id);
    }
    this.items.set(record.metadata.id, record);
  }

  private updateStatus(id: OperationId, status: TrackedOperationStatus, reason?: string): void {
    const existing = this.items.get(id);
    if (!existing) {
      return;
    }

    this.items.set(id, {
      ...existing,
      status,
      reason: reason ?? existing.reason,
      timestamp: Date.now()
    });
  }
}


