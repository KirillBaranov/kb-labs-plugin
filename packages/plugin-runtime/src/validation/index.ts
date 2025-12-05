/**
 * @module @kb-labs/plugin-runtime/validation
 * Validation utilities for schemas and handlers
 */

export { parseHandlerRef } from './handler-parser';
export { resolveSchema } from './schema-resolver';
export { validateSchema, validateInput, validateOutput } from './schema-validator';
export {
  validatePlatformRequirements,
  formatPlatformValidationError,
  formatPlatformValidationWarning,
  type PlatformValidationResult,
} from './platform-requirements';


