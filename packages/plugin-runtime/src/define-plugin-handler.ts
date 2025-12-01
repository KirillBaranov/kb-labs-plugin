/**
 * @module @kb-labs/plugin-runtime/define-plugin-handler
 * Plugin handler builder with type safety and validation
 *
 * Provides a definePluginHandler function similar to defineCommand from command-kit,
 * with automatic type inference, optional schema validation, and error handling.
 */

import type { z as ZodNamespace } from 'zod';
import type { PluginHandler, PluginHandlerContext } from './types';

/**
 * Zod schema type (imported as type to avoid hard dependency)
 */
export type ZodSchema<T = unknown> = ZodNamespace.ZodType<T>;

/**
 * Plugin handler configuration
 *
 * @template TInput - Input data type
 * @template TOutput - Output data type
 */
export interface PluginHandlerConfig<TInput = unknown, TOutput = unknown> {
  /**
   * Optional schema validation for input/output
   * Uses Zod for runtime type checking
   *
   * @example
   * ```typescript
   * import { z } from 'zod';
   *
   * {
   *   schema: {
   *     input: z.object({ userId: z.string().uuid() }),
   *     output: z.object({ user: UserSchema })
   *   }
   * }
   * ```
   */
  schema?: {
    /** Input validation schema */
    input?: ZodSchema<TInput>;
    /** Output validation schema */
    output?: ZodSchema<TOutput>;
  };

  /**
   * Plugin handler function
   * Receives validated input and full context
   */
  handle: (input: TInput, ctx: PluginHandlerContext) => Promise<TOutput>;

  /**
   * Optional error handler
   * Called when handle throws or validation fails
   * If not provided, errors are re-thrown
   */
  onError?: (error: Error, ctx: PluginHandlerContext) => Promise<TOutput>;
}

/**
 * Define a plugin handler with automatic type inference and validation
 *
 * This function provides:
 * - Type-safe input/output with generic parameters
 * - Optional schema validation via Zod
 * - Automatic error handling
 * - Consistent patterns with defineCommand from command-kit
 *
 * @template TInput - Type of input data (default: unknown)
 * @template TOutput - Type of output data (default: unknown)
 *
 * @param config - Handler configuration
 * @returns A PluginHandler function ready to export
 *
 * @example
 * ```typescript
 * // Simple handler (no validation)
 * export const handler = definePluginHandler({
 *   async handle(input, ctx) {
 *     ctx.output.info('Processing...');
 *     return { status: 'ok' };
 *   }
 * });
 *
 * // Typed handler
 * type Input = { userId: string };
 * type Output = { user: User; posts: Post[] };
 *
 * export const handler = definePluginHandler<Input, Output>({
 *   async handle(input, ctx) {
 *     // input is automatically typed as Input
 *     const user = await fetchUser(input.userId);
 *     const posts = await ctx.api.state.get<Post[]>(`posts:${input.userId}`);
 *
 *     // TypeScript validates return type matches Output
 *     return { user, posts: posts || [] };
 *   }
 * });
 *
 * // With schema validation
 * import { z } from 'zod';
 *
 * export const handler = definePluginHandler<Input, Output>({
 *   schema: {
 *     input: z.object({
 *       userId: z.string().uuid()
 *     }),
 *     output: z.object({
 *       user: UserSchema,
 *       posts: z.array(PostSchema)
 *     })
 *   },
 *   async handle(input, ctx) {
 *     // input is validated before this runs
 *     const user = await fetchUser(input.userId);
 *     const posts = await getPostsForUser(input.userId);
 *
 *     // output is validated before returning
 *     return { user, posts };
 *   },
 *   onError: async (error, ctx) => {
 *     // Custom error handling
 *     ctx.output.error(`Failed to fetch user: ${error.message}`);
 *     return { user: null, posts: [] };
 *   }
 * });
 *
 * // Using all new APIs
 * export const handler = definePluginHandler<Input, Output>({
 *   async handle(input, ctx) {
 *     // Invoke another plugin
 *     const userResult = await ctx.api.invoke<{ user: User }>({
 *       pluginId: 'user-service',
 *       input: { id: input.userId }
 *     });
 *
 *     // State management with TTL
 *     await ctx.api.state.set('user', userResult.data, 60000);
 *     const cached = await ctx.api.state.get<User>('user');
 *
 *     // Emit events
 *     await ctx.api.events.emit<{ userId: string }>('user.fetched', {
 *       userId: input.userId
 *     });
 *
 *     // Artifacts
 *     await ctx.api.artifacts.write({
 *       path: 'user-data.json',
 *       data: userResult.data
 *     });
 *
 *     // Shell execution
 *     const result = await ctx.api.shell.exec('git', ['status']);
 *
 *     // Output
 *     ctx.output.info('User fetched successfully');
 *     ctx.output.json({ user: cached });
 *
 *     return { user: cached, posts: [] };
 *   }
 * });
 * ```
 */
export function definePluginHandler<TInput = unknown, TOutput = unknown>(
  config: PluginHandlerConfig<TInput, TOutput>
): PluginHandler<TInput, TOutput> {
  return async (input: unknown, ctx: PluginHandlerContext): Promise<TOutput> => {
    try {
      // Validate input if schema provided
      let validatedInput: TInput;
      if (config.schema?.input) {
        validatedInput = config.schema.input.parse(input);
      } else {
        validatedInput = input as TInput;
      }

      // Execute handler
      const output = await config.handle(validatedInput, ctx);

      // Validate output if schema provided
      if (config.schema?.output) {
        config.schema.output.parse(output);
      }

      return output;
    } catch (error) {
      // Use custom error handler if provided
      if (config.onError) {
        return config.onError(error as Error, ctx);
      }

      // Otherwise re-throw
      throw error;
    }
  };
}

/**
 * Helper type to extract input type from a plugin handler
 *
 * @example
 * ```typescript
 * const handler: PluginHandler<{ name: string }, { greeting: string }> = ...;
 * type Input = InferInput<typeof handler>; // { name: string }
 * ```
 */
export type InferInput<T> = T extends PluginHandler<infer I, any> ? I : never;

/**
 * Helper type to extract output type from a plugin handler
 *
 * @example
 * ```typescript
 * const handler: PluginHandler<{ name: string }, { greeting: string }> = ...;
 * type Output = InferOutput<typeof handler>; // { greeting: string }
 * ```
 */
export type InferOutput<T> = T extends PluginHandler<any, infer O> ? O : never;

/**
 * Typed plugin definition
 * Useful for plugin registries and type-safe plugin management
 *
 * @example
 * ```typescript
 * const greeterPlugin: TypedPlugin<
 *   { name: string },
 *   { greeting: string }
 * > = {
 *   id: 'greeter',
 *   version: '1.0.0',
 *   handler: async (input, ctx) => {
 *     ctx.output.info(`Greeting ${input.name}`);
 *     return { greeting: `Hello, ${input.name}!` };
 *   }
 * };
 * ```
 */
export interface TypedPlugin<TInput, TOutput> {
  /** Plugin identifier */
  id: string;
  /** Plugin version (semver) */
  version: string;
  /** Plugin handler */
  handler: PluginHandler<TInput, TOutput>;
}

/**
 * Helper function to create a typed plugin handler without builder pattern
 * Useful for simple cases where you don't need validation
 *
 * @example
 * ```typescript
 * export const handler = createTypedHandler<Input, Output>(
 *   async (input, ctx) => {
 *     // input is typed as Input
 *     // return must be Output
 *     return { user: await fetchUser(input.userId) };
 *   }
 * );
 * ```
 */
export function createTypedHandler<TInput, TOutput>(
  handler: (input: TInput, ctx: PluginHandlerContext) => Promise<TOutput>
): PluginHandler<TInput, TOutput> {
  return async (input: unknown, ctx: PluginHandlerContext) => {
    return handler(input as TInput, ctx);
  };
}
