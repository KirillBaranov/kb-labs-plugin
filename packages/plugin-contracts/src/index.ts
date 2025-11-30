/**
 * @module @kb-labs/plugin-contracts
 * Type definitions and contracts for KB Labs plugin runtime APIs
 * 
 * This package provides versioned type definitions for plugin runtime APIs
 * (Shell, Artifacts, Invoke, etc.) to ensure consistency across all plugins.
 * 
 * Versioning policy:
 * - Package version (SemVer): npm package version
 * - API version (v1, v2, etc.): Built into type names for API evolution
 * - MAJOR: Breaking changes in API
 * - MINOR: New fields added (backward compatible)
 * - PATCH: Type corrections, documentation updates
 */

export * from './shell/index';
export * from './artifacts/index';
export * from './invoke/index';

