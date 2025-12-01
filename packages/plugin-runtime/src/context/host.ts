/**
 * @module @kb-labs/plugin-runtime/context/host
 * Shared host type declarations for plugin context.
 */

/**
 * Known host types that can execute plugins.
 */
export const KNOWN_PLUGIN_HOSTS = ['cli', 'workflow', 'rest'] as const;

export type KnownPluginHost = (typeof KNOWN_PLUGIN_HOSTS)[number];

/**
 * Host type identifier. Custom hosts should use a reverse-DNS style name to
 * avoid conflicts (e.g. `devtools.preview`).
 */
export type PluginHostType = KnownPluginHost | string;

/**
 * Validate whether the provided host value is one of the built-in host types.
 */
export function isKnownPluginHost(host: string): host is KnownPluginHost {
  return KNOWN_PLUGIN_HOSTS.includes(host as KnownPluginHost);
}


