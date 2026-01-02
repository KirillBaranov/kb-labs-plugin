/**
 * @module @kb-labs/plugin-execution/__tests__/errors
 *
 * Tests for execution layer error types.
 */

import { describe, it, expect } from 'vitest';
import {
  ExecutionLayerError,
  AbortError,
  TimeoutError,
  HandlerNotFoundError,
  HandlerContractError,
  isExecutionLayerError,
} from '../errors.js';

describe('Errors', () => {
  describe('ExecutionLayerError', () => {
    it('should create error with message and code', () => {
      const error = new ExecutionLayerError('Test message', 'HANDLER_ERROR');

      expect(error.message).toBe('Test message');
      expect(error.code).toBe('HANDLER_ERROR');
      expect(error.name).toBe('ExecutionLayerError');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExecutionLayerError);
    });

    it('should store details', () => {
      const error = new ExecutionLayerError('With details', 'HANDLER_ERROR', {
        key: 'value',
        num: 42,
      });

      expect(error.details).toEqual({
        key: 'value',
        num: 42,
      });
    });

    it('should have stack trace', () => {
      const error = new ExecutionLayerError('Stack error', 'HANDLER_ERROR');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('Stack error');
    });

    it('should serialize to JSON (ExecutionError format without name)', () => {
      const error = new ExecutionLayerError('Serialize', 'HANDLER_ERROR', { foo: 'bar' });

      const json = error.toJSON();

      // Note: ExecutionError interface doesn't include 'name'
      expect(json).toEqual({
        message: 'Serialize',
        code: 'HANDLER_ERROR',
        details: { foo: 'bar' },
        stack: expect.any(String),
      });
    });

    it('should default to UNKNOWN_ERROR code', () => {
      const error = new ExecutionLayerError('Default code');

      expect(error.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('AbortError', () => {
    it('should create with custom message', () => {
      const error = new AbortError('User cancelled operation');

      expect(error.message).toBe('User cancelled operation');
      expect(error.code).toBe('ABORTED');
      expect(error.name).toBe('AbortError');
      expect(error).toBeInstanceOf(AbortError);
      expect(error).toBeInstanceOf(ExecutionLayerError);
    });

    it('should create with default message', () => {
      const error = new AbortError();

      expect(error.message).toBe('Execution aborted');
      expect(error.code).toBe('ABORTED');
    });
  });

  describe('TimeoutError', () => {
    it('should create with message', () => {
      const error = new TimeoutError('Request timed out after 30s');

      expect(error.message).toBe('Request timed out after 30s');
      expect(error.code).toBe('TIMEOUT');
      expect(error.name).toBe('TimeoutError');
      expect(error).toBeInstanceOf(TimeoutError);
    });

    it('should create with message and timeoutMs', () => {
      const error = new TimeoutError('Timeout occurred', 30000);

      expect(error.message).toBe('Timeout occurred');
      expect(error.code).toBe('TIMEOUT');
      expect(error.timeoutMs).toBe(30000);
      expect(error.details?.timeoutMs).toBe(30000);
    });
  });

  describe('HandlerNotFoundError', () => {
    it('should include handler path in message', () => {
      const error = new HandlerNotFoundError('/path/to/missing/handler.js');

      expect(error.message).toContain('/path/to/missing/handler.js');
      expect(error.code).toBe('HANDLER_NOT_FOUND');
      expect(error.name).toBe('HandlerNotFoundError');
      expect(error).toBeInstanceOf(HandlerNotFoundError);
    });

    it('should store handler path in details and as property', () => {
      const error = new HandlerNotFoundError('./dist/handler.js');

      expect(error.details?.handlerPath).toBe('./dist/handler.js');
      expect(error.handlerPath).toBe('./dist/handler.js');
    });
  });

  describe('HandlerContractError', () => {
    it('should create with violation message', () => {
      const error = new HandlerContractError('Handler must export default function');

      expect(error.message).toBe('Handler must export default function');
      expect(error.code).toBe('HANDLER_CONTRACT_ERROR');
      expect(error.name).toBe('HandlerContractError');
      expect(error).toBeInstanceOf(HandlerContractError);
    });
  });

  describe('isExecutionLayerError', () => {
    it('should return true for ExecutionLayerError', () => {
      const error = new ExecutionLayerError('Test', 'HANDLER_ERROR');
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should return true for AbortError', () => {
      const error = new AbortError();
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should return true for TimeoutError', () => {
      const error = new TimeoutError('Timeout');
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should return true for HandlerNotFoundError', () => {
      const error = new HandlerNotFoundError('/path');
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should return true for HandlerContractError', () => {
      const error = new HandlerContractError('violation');
      expect(isExecutionLayerError(error)).toBe(true);
    });

    it('should return false for regular Error', () => {
      const error = new Error('Regular');
      expect(isExecutionLayerError(error)).toBe(false);
    });

    it('should return false for TypeError', () => {
      const error = new TypeError('Type error');
      expect(isExecutionLayerError(error)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isExecutionLayerError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isExecutionLayerError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isExecutionLayerError('error')).toBe(false);
    });

    it('should return false for object without code property', () => {
      expect(isExecutionLayerError({ message: 'error' })).toBe(false);
    });
  });

  describe('Error inheritance', () => {
    it('all errors should be instanceof Error', () => {
      expect(new ExecutionLayerError('msg', 'HANDLER_ERROR')).toBeInstanceOf(Error);
      expect(new AbortError()).toBeInstanceOf(Error);
      expect(new TimeoutError('timeout')).toBeInstanceOf(Error);
      expect(new HandlerNotFoundError('/path')).toBeInstanceOf(Error);
      expect(new HandlerContractError('violation')).toBeInstanceOf(Error);
    });

    it('specialized errors should be instanceof ExecutionLayerError', () => {
      expect(new AbortError()).toBeInstanceOf(ExecutionLayerError);
      expect(new TimeoutError('timeout')).toBeInstanceOf(ExecutionLayerError);
      expect(new HandlerNotFoundError('/path')).toBeInstanceOf(ExecutionLayerError);
      expect(new HandlerContractError('violation')).toBeInstanceOf(ExecutionLayerError);
    });
  });
});
