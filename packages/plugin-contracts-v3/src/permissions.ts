/**
 * Permission specification for V3 Plugin System
 *
 * Permissions define what resources and operations a plugin can access.
 * They are declared in the plugin manifest and can be restricted by user config.
 */
export interface PermissionSpec {
  /**
   * Filesystem permissions
   */
  fs?: {
    /** Directories allowed for reading (relative to cwd or absolute) */
    read?: string[];
    /** Directories allowed for writing (relative to cwd or absolute) */
    write?: string[];
  };

  /**
   * Network permissions
   */
  network?: {
    /** Allowed URL patterns for fetch (glob or regex) */
    fetch?: string[];
  };

  /**
   * Environment variable permissions
   */
  env?: {
    /** Allowed env variable patterns (prefix or exact) */
    read?: string[];
  };

  /**
   * Platform service permissions
   */
  platform?: {
    /** LLM access */
    llm?: boolean | { models?: string[] };
    /** Vector store access */
    vectorStore?: boolean | { collections?: string[] };
    /** Cache access */
    cache?: boolean | { namespaces?: string[] };
    /** Storage access */
    storage?: boolean | { paths?: string[] };
    /** Analytics access */
    analytics?: boolean;
    /** Embeddings access */
    embeddings?: boolean;
  };

  /**
   * Shell execution permissions
   */
  shell?: {
    /** Whether shell is allowed at all */
    allowed?: boolean;
    /** Whitelist of allowed commands */
    commands?: string[];
  };

  /**
   * Plugin invocation permissions
   */
  invoke?: {
    /** Whether invoke is allowed at all */
    allowed?: boolean;
    /** Whitelist of plugin IDs that can be invoked */
    plugins?: string[];
  };
}

/**
 * Default permissions (secure by default)
 */
export const DEFAULT_PERMISSIONS: PermissionSpec = {
  fs: {
    read: ['.'], // cwd only
    write: [], // Only outdir
  },
  network: {
    fetch: [], // No network by default
  },
  env: {
    read: [], // Only NODE_ENV, CI, DEBUG (always allowed)
  },
  platform: {
    llm: false,
    vectorStore: false,
    cache: false,
    storage: false,
    analytics: false,
    embeddings: false,
  },
  shell: {
    allowed: false,
  },
  invoke: {
    allowed: false,
  },
};
