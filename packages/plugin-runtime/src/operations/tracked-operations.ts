import type { ExecutionContext } from '../types';
import type { OperationWithMetadata } from '@kb-labs/setup-engine-operations';

type StructuredCloneLike = <T>(value: T) => T;

export function getTrackedOperations(ctx: ExecutionContext): OperationWithMetadata[] {
  const tracker = ctx.operationTracker;
  return tracker ? tracker.toArray().map(cloneOperation) : [];
}

export function clearTrackedOperations(ctx: ExecutionContext): void {
  ctx.operationTracker?.clear();
}

function cloneOperation(operation: OperationWithMetadata): OperationWithMetadata {
  const globalClone = (globalThis as { structuredClone?: StructuredCloneLike }).structuredClone;
  if (globalClone) {
    return globalClone(operation);
  }
  return JSON.parse(JSON.stringify(operation)) as OperationWithMetadata;
}
