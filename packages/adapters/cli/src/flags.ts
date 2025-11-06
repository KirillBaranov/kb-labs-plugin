/**
 * @module @kb-labs/plugin-adapter-cli/flags
 * Flag mapping from manifest to CLI framework
 */

import type { CliFlagDecl } from '@kb-labs/plugin-manifest';
import type { FlagBuilder } from '@kb-labs/cli-core';

/**
 * Convert manifest flag declaration to CLI flag
 */
export function mapFlag(flag: CliFlagDecl, builder: FlagBuilder): void {
  const flagName = flag.name;
  const alias = flag.alias;
  const description = flag.description || '';
  const defaultValue = flag.default;
  const required = flag.required || false;
  const choices = flag.choices;

  // Build flag configuration based on type
  switch (flag.type) {
    case 'string': {
      const flagConfig: Record<string, unknown> = {
        type: 'string',
        description,
      };

      if (alias) {
        flagConfig.alias = alias;
      }

      if (defaultValue !== undefined) {
        flagConfig.default = defaultValue;
      }

      if (required) {
        flagConfig.demandOption = true;
      }

      if (choices && choices.length > 0) {
        flagConfig.choices = choices;
      }

      builder({ [flagName]: flagConfig });
      break;
    }

    case 'boolean': {
      const flagConfig: Record<string, unknown> = {
        type: 'boolean',
        description,
      };

      if (alias) {
        flagConfig.alias = alias;
      }

      if (defaultValue !== undefined) {
        flagConfig.default = defaultValue;
      }

      builder({ [flagName]: flagConfig });
      break;
    }

    case 'number': {
      const flagConfig: Record<string, unknown> = {
        type: 'number',
        description,
      };

      if (alias) {
        flagConfig.alias = alias;
      }

      if (defaultValue !== undefined) {
        flagConfig.default = defaultValue;
      }

      if (required) {
        flagConfig.demandOption = true;
      }

      if (choices && choices.length > 0) {
        flagConfig.choices = choices.map(Number);
      }

      builder({ [flagName]: flagConfig });
      break;
    }

    case 'array': {
      const flagConfig: Record<string, unknown> = {
        type: 'array',
        description,
      };

      if (alias) {
        flagConfig.alias = alias;
      }

      if (defaultValue !== undefined) {
        flagConfig.default = Array.isArray(defaultValue) ? defaultValue : [defaultValue];
      }

      if (required) {
        flagConfig.demandOption = true;
      }

      if (choices && choices.length > 0) {
        flagConfig.choices = choices;
      }

      builder({ [flagName]: flagConfig });
      break;
    }

    default: {
      throw new Error(`Unsupported flag type: ${flag.type}`);
    }
  }
}

/**
 * Register all flags from command declaration
 */
export function registerFlags(
  flags: CliFlagDecl[],
  builder: FlagBuilder
): void {
  for (const flag of flags) {
    mapFlag(flag, builder);
  }
}
