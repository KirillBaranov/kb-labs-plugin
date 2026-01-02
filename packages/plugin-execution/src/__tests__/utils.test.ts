/**
 * @module @kb-labs/plugin-execution/__tests__/utils
 *
 * Tests for utility functions: normalizeError, createExecutionId, normalizeHeaders.
 */

import { describe, it, expect } from 'vitest';
import { normalizeError, createExecutionId, normalizeHeaders } from '../utils.js';
import { AbortError, HandlerNotFoundError, TimeoutError, ExecutionLayerError } from '../errors.js';
import { PluginError } from '@kb-labs/plugin-contracts';

describe('Utils', () => {
  describe('createExecutionId', () => {
    it('should generate unique IDs', () => {
      const id1 = createExecutionId();
      const id2 = createExecutionId();
      const id3 = createExecutionId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should generate string IDs', () => {
      const id = createExecutionId();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should generate IDs with expected format', () => {
      const id = createExecutionId();
      // Should be a valid ULID or similar format
      expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('normalizeHeaders', () => {
    it('should convert IncomingHttpHeaders to Record<string, string>', () => {
      const input = {
        'content-type': 'application/json',
        'x-request-id': '123',
        accept: 'text/html',
      };

      const result = normalizeHeaders(input);

      expect(result).toEqual({
        'content-type': 'application/json',
        'x-request-id': '123',
        accept: 'text/html',
      });
    });

    it('should handle array values by joining with comma', () => {
      const input = {
        'accept-encoding': ['gzip', 'deflate'],
        'x-custom': ['a', 'b', 'c'],
      };

      const result = normalizeHeaders(input);

      expect(result['accept-encoding']).toBe('gzip, deflate');
      expect(result['x-custom']).toBe('a, b, c');
    });

    it('should skip undefined values', () => {
      const input = {
        defined: 'value',
        undefinedValue: undefined,
      };

      const result = normalizeHeaders(input);

      expect(result).toEqual({ defined: 'value' });
      expect('undefinedValue' in result).toBe(false);
    });

    it('should handle empty headers', () => {
      const result = normalizeHeaders({});
      expect(result).toEqual({});
    });

    it('should handle mixed values', () => {
      const input = {
        single: 'value',
        array: ['a', 'b'],
        empty: undefined,
      };

      const result = normalizeHeaders(input);

      expect(result).toEqual({
        single: 'value',
        array: 'a, b',
      });
    });
  });

  describe('normalizeError', () => {
    // Note: normalizeError uses ExecutionError interface which doesn't have 'name' field

    it('should return ExecutionError for AbortError', () => {
      const error = new AbortError('User cancelled');

      const result = normalizeError(error);

      expect(result.code).toBe('ABORTED');
      expect(result.message).toBe('User cancelled');
      // Note: ExecutionError doesn't have 'name' field
    });

    it('should return ExecutionError for TimeoutError', () => {
      const error = new TimeoutError('Request took too long');

      const result = normalizeError(error);

      expect(result.code).toBe('TIMEOUT');
      expect(result.message).toBe('Request took too long');
    });

    it('should return ExecutionError for HandlerNotFoundError', () => {
      const error = new HandlerNotFoundError('/path/to/handler.js');

      const result = normalizeError(error);

      expect(result.code).toBe('HANDLER_NOT_FOUND');
      expect(result.message).toContain('/path/to/handler.js');
    });

    it('should return ExecutionError for ExecutionLayerError with valid code', () => {
      const error = new ExecutionLayerError('Something went wrong', 'HANDLER_ERROR');

      const result = normalizeError(error);

      expect(result.code).toBe('HANDLER_ERROR');
      expect(result.message).toBe('Something went wrong');
    });

    it('should convert regular Error to ExecutionError with HANDLER_ERROR code', () => {
      // Regular Error without code property gets HANDLER_ERROR
      const error = new Error('Regular error message');

      const result = normalizeError(error);

      expect(result.code).toBe('HANDLER_ERROR');
      expect(result.message).toBe('Regular error message');
    });

    it('should use HANDLER_ERROR for Error with unknown code', () => {
      const error = new Error('Error with unknown code');
      (error as any).code = 'UNKNOWN_CODE_NOT_IN_LIST';

      const result = normalizeError(error);

      // Unknown codes get clamped to HANDLER_ERROR
      expect(result.code).toBe('HANDLER_ERROR');
    });

    it('should preserve valid known codes from Error', () => {
      const error = new Error('Error with valid code');
      (error as any).code = 'TIMEOUT';

      const result = normalizeError(error);

      expect(result.code).toBe('TIMEOUT');
    });

    it('should convert string to ExecutionError with UNKNOWN_ERROR', () => {
      const result = normalizeError('string error');

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('string error');
    });

    it('should convert number to ExecutionError with UNKNOWN_ERROR', () => {
      const result = normalizeError(42);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('42');
    });

    it('should convert object to ExecutionError with UNKNOWN_ERROR', () => {
      const result = normalizeError({ custom: 'object' });

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('[object Object]');
    });

    it('should handle null with UNKNOWN_ERROR', () => {
      const result = normalizeError(null);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('null');
    });

    it('should handle undefined with UNKNOWN_ERROR', () => {
      const result = normalizeError(undefined);

      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('undefined');
    });

    it('should preserve stack trace when available', () => {
      const error = new Error('Error with stack');

      const result = normalizeError(error);

      expect(result.stack).toBeDefined();
      expect(result.stack).toContain('Error with stack');
    });

    it('should preserve details from ExecutionLayerError', () => {
      const error = new ExecutionLayerError('Error with details', 'HANDLER_ERROR', {
        field: 'value',
        nested: { key: 'data' },
      });

      const result = normalizeError(error);

      expect(result.details).toEqual({
        field: 'value',
        nested: { key: 'data' },
      });
    });
  });
});
