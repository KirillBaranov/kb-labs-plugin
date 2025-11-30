/**
 * @module @kb-labs/plugin-adapter-rest
 * REST API adapter for Plugin Model v2
 */

// Route mounting
export {
  mountRoutes,
  type PluginRuntime,
} from './mount';

// Validation
export {
  resolveSchema,
  validateData,
} from './validation';

// Handler
export { executeRoute } from './handler';

// Errors
export {
  handleError,
  createErrorGuard,
} from './errors';

// OpenAPI
export {
  generateOpenAPI,
  type OpenAPISpec,
} from './openapi';

// Header policy utilities
export {
  resolveHeaderPolicy,
  compileHeaderPolicy,
  type ResolvedHeaderPolicy,
  type CompiledHeaderPolicy,
} from './header-policy';
