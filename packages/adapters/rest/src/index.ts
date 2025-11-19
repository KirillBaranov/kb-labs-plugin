/**
 * @module @kb-labs/plugin-adapter-rest
 * REST API adapter for Plugin Model v2
 */

// Route mounting
export {
  mountRoutes,
  type PluginRuntime,
} from './mount.js';

// Validation
export {
  resolveSchema,
  validateData,
} from './validation.js';

// Handler
export { executeRoute } from './handler.js';

// Errors
export {
  handleError,
  createErrorGuard,
} from './errors.js';

// OpenAPI
export {
  generateOpenAPI,
  type OpenAPISpec,
} from './openapi.js';

// Header policy utilities
export {
  resolveHeaderPolicy,
  compileHeaderPolicy,
  type ResolvedHeaderPolicy,
  type CompiledHeaderPolicy,
} from './header-policy.js';
