/**
 * @module @kb-labs/plugin-runtime/io/env
 * Environment variable whitelisting
 */

/**
 * Pick whitelisted environment variables
 * @param env - Source environment (process.env)
 * @param allowList - Allowed environment variable keys
 * @returns Filtered environment object (no references to original)
 */
export function pickEnv(
  env: NodeJS.ProcessEnv,
  allowList: string[] | undefined
): NodeJS.ProcessEnv {
  if (!allowList || allowList.length === 0) {
    return {};
  }

  const filtered: NodeJS.ProcessEnv = {};

  for (const key of allowList) {
    // Support wildcard patterns (e.g., 'KB_LABS_*')
    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      for (const envKey in env) {
        if (envKey.startsWith(prefix)) {
          filtered[envKey] = env[envKey];
        }
      }
    } else {
      // Exact match
      if (key in env) {
        filtered[key] = env[key];
      }
    }
  }

  return filtered;
}

/**
 * Create safe environment variable accessor
 * @param allowList - Allowed environment variable keys
 * @param env - Environment object (already filtered)
 * @returns Function to get environment variable value
 */
export function createEnvAccessor(
  allowList: string[] | undefined,
  env: NodeJS.ProcessEnv
): (key: string) => string | undefined {
  return (key: string): string | undefined => {
    // Check if key is allowed
    if (!allowList || allowList.length === 0) {
      return undefined;
    }

    // Support wildcard patterns
    const isAllowed =
      allowList.includes(key) ||
      allowList.some((pattern) => {
        if (pattern.endsWith('*')) {
          return key.startsWith(pattern.slice(0, -1));
        }
        return false;
      });

    if (!isAllowed) {
      return undefined;
    }

    return env[key];
  };
}

