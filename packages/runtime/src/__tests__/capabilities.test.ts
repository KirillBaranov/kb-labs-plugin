/**
 * @module @kb-labs/plugin-runtime/__tests__/capabilities
 * Tests for capability checks
 */

import { describe, it, expect } from 'vitest';
import {
  checkCapabilities,
  validateCapabilityNames,
  KNOWN_CAPABILITIES,
} from '../capabilities.js';

describe('checkCapabilities', () => {
  it('should grant all capabilities when all required are present', () => {
    const required = ['kv.read', 'blob.write'];
    const granted = ['kv.read', 'blob.write', 'http.fetch'];

    const result = checkCapabilities(required, granted);

    expect(result.granted).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.grantedCapabilities).toEqual(['kv.read', 'blob.write']);
  });

  it('should deny when some capabilities are missing', () => {
    const required = ['kv.read', 'blob.write', 'http.fetch'];
    const granted = ['kv.read', 'blob.write'];

    const result = checkCapabilities(required, granted);

    expect(result.granted).toBe(false);
    expect(result.missing).toEqual(['http.fetch']);
    expect(result.grantedCapabilities).toEqual(['kv.read', 'blob.write']);
  });

  it('should grant when no capabilities are required', () => {
    const required: string[] = [];
    const granted = ['kv.read'];

    const result = checkCapabilities(required, granted);

    expect(result.granted).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.grantedCapabilities).toEqual([]);
  });

  it('should deny by default when no capabilities are granted', () => {
    const required = ['kv.read'];
    const granted: string[] = [];

    const result = checkCapabilities(required, granted);

    expect(result.granted).toBe(false);
    expect(result.missing).toEqual(['kv.read']);
    expect(result.grantedCapabilities).toEqual([]);
  });
});

describe('validateCapabilityNames', () => {
  it('should detect unknown capabilities', () => {
    const capabilities = ['kv.read', 'unknown.cap', 'blob.write'];

    const result = validateCapabilityNames(capabilities);

    expect(result.unknown).toEqual(['unknown.cap']);
  });

  it('should return empty array for all known capabilities', () => {
    const capabilities = Array.from(KNOWN_CAPABILITIES);

    const result = validateCapabilityNames(capabilities);

    expect(result.unknown).toEqual([]);
  });
});
