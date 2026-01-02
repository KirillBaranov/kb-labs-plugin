/**
 * @module @kb-labs/plugin-execution/__tests__/phase2-errors
 *
 * Tests for Phase 2 pool-specific error classes.
 */

import { describe, it, expect } from 'vitest';
import {
  QueueFullError,
  AcquireTimeoutError,
  WorkerCrashedError,
  WorkerUnhealthyError,
  isExecutionLayerError,
  isKnownErrorCode,
} from '../errors.js';

describe('Phase 2 Error Classes', () => {
  describe('QueueFullError', () => {
    it('should create error with queue info', () => {
      const error = new QueueFullError(100, 100);

      expect(error.message).toBe('Queue full: 100/100 requests pending');
      expect(error.code).toBe('QUEUE_FULL');
      expect(error.queueSize).toBe(100);
      expect(error.maxQueueSize).toBe(100);
      expect(error.name).toBe('QueueFullError');
    });

    it('should be ExecutionLayerError', () => {
      const error = new QueueFullError(50, 100);
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should serialize to JSON', () => {
      const error = new QueueFullError(75, 100);
      const json = error.toJSON();

      expect(json.message).toBe('Queue full: 75/100 requests pending');
      expect(json.code).toBe('QUEUE_FULL');
      expect(json.details).toEqual({ queueSize: 75, maxQueueSize: 100 });
    });
  });

  describe('AcquireTimeoutError', () => {
    it('should create error with timeout info', () => {
      const error = new AcquireTimeoutError(5000);

      expect(error.message).toBe('No worker available within 5000ms');
      expect(error.code).toBe('ACQUIRE_TIMEOUT');
      expect(error.acquireTimeoutMs).toBe(5000);
      expect(error.name).toBe('AcquireTimeoutError');
    });

    it('should be ExecutionLayerError', () => {
      const error = new AcquireTimeoutError(3000);
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should serialize to JSON', () => {
      const error = new AcquireTimeoutError(10000);
      const json = error.toJSON();

      expect(json.message).toBe('No worker available within 10000ms');
      expect(json.code).toBe('ACQUIRE_TIMEOUT');
      expect(json.details).toEqual({ acquireTimeoutMs: 10000 });
    });
  });

  describe('WorkerCrashedError', () => {
    it('should create error with exit code', () => {
      const error = new WorkerCrashedError('worker_abc123', 1);

      expect(error.message).toBe('Worker worker_abc123 crashed with exit code 1');
      expect(error.code).toBe('WORKER_CRASHED');
      expect(error.workerId).toBe('worker_abc123');
      expect(error.exitCode).toBe(1);
      expect(error.signal).toBeUndefined();
      expect(error.name).toBe('WorkerCrashedError');
    });

    it('should create error with signal', () => {
      const error = new WorkerCrashedError('worker_xyz', undefined, 'SIGKILL');

      expect(error.message).toBe('Worker worker_xyz crashed (signal: SIGKILL)');
      expect(error.signal).toBe('SIGKILL');
    });

    it('should create error with both exit code and signal', () => {
      const error = new WorkerCrashedError('worker_123', 137, 'SIGTERM');

      expect(error.message).toBe('Worker worker_123 crashed with exit code 137 (signal: SIGTERM)');
      expect(error.exitCode).toBe(137);
      expect(error.signal).toBe('SIGTERM');
    });

    it('should create error without exit code or signal', () => {
      const error = new WorkerCrashedError('worker_simple');

      expect(error.message).toBe('Worker worker_simple crashed');
    });

    it('should be ExecutionLayerError', () => {
      const error = new WorkerCrashedError('worker_test', 1);
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should serialize to JSON', () => {
      const error = new WorkerCrashedError('worker_json', 1, 'SIGTERM');
      const json = error.toJSON();

      expect(json.code).toBe('WORKER_CRASHED');
      expect(json.details).toEqual({
        workerId: 'worker_json',
        exitCode: 1,
        signal: 'SIGTERM',
      });
    });
  });

  describe('WorkerUnhealthyError', () => {
    it('should create error with reason', () => {
      const error = new WorkerUnhealthyError('worker_sick', 'Health check timeout');

      expect(error.message).toBe('Worker worker_sick is unhealthy: Health check timeout');
      expect(error.code).toBe('WORKER_UNHEALTHY');
      expect(error.workerId).toBe('worker_sick');
      expect(error.reason).toBe('Health check timeout');
      expect(error.name).toBe('WorkerUnhealthyError');
    });

    it('should be ExecutionLayerError', () => {
      const error = new WorkerUnhealthyError('worker_test', 'Memory limit exceeded');
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should serialize to JSON', () => {
      const error = new WorkerUnhealthyError('worker_json', 'Unresponsive');
      const json = error.toJSON();

      expect(json.code).toBe('WORKER_UNHEALTHY');
      expect(json.details).toEqual({
        workerId: 'worker_json',
        reason: 'Unresponsive',
      });
    });
  });

  describe('isKnownErrorCode', () => {
    it('should recognize Phase 2 error codes', () => {
      expect(isKnownErrorCode('QUEUE_FULL')).toBe(true);
      expect(isKnownErrorCode('ACQUIRE_TIMEOUT')).toBe(true);
      expect(isKnownErrorCode('WORKER_CRASHED')).toBe(true);
      expect(isKnownErrorCode('WORKER_UNHEALTHY')).toBe(true);
    });

    it('should still recognize Phase 1 error codes', () => {
      expect(isKnownErrorCode('TIMEOUT')).toBe(true);
      expect(isKnownErrorCode('ABORTED')).toBe(true);
      expect(isKnownErrorCode('HANDLER_ERROR')).toBe(true);
      expect(isKnownErrorCode('UNKNOWN_ERROR')).toBe(true);
    });

    it('should reject unknown error codes', () => {
      expect(isKnownErrorCode('INVALID_CODE')).toBe(false);
      expect(isKnownErrorCode('')).toBe(false);
      expect(isKnownErrorCode(null)).toBe(false);
      expect(isKnownErrorCode(undefined)).toBe(false);
    });
  });
});
