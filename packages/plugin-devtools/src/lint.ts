/**
 * @module @kb-labs/plugin-devtools/lint
 * Manifest linting rules
 */

import type { ManifestV2, RestRouteDecl, SchemaRef } from '@kb-labs/plugin-manifest';
import { validateManifestV2 } from '@kb-labs/plugin-manifest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

/**
 * Lint error
 */
export interface LintError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Error location (path in manifest) */
  location?: string;
  /** Severity */
  severity: 'error' | 'warning';
}

/**
 * Lint result
 */
export interface LintResult {
  /** Whether linting passed */
  valid: boolean;
  /** Lint errors */
  errors: LintError[];
  /** Lint warnings */
  warnings: LintError[];
}

/**
 * Validate path template syntax
 */
function validatePathTemplate(
  pathTemplate: string,
  artifactId: string
): LintError[] {
  const errors: LintError[] = [];

  // Reserved placeholders
  const reservedPlaceholders = ['profile', 'runId', 'ts'];
  const placeholderRegex = /\{(\w+)\}/g;
  const matches = [...pathTemplate.matchAll(placeholderRegex)];

  for (const match of matches) {
    const placeholder = match[1] || '';
    // Check if placeholder is reserved (optional - just warn)
    if (!reservedPlaceholders.includes(placeholder)) {
      errors.push({
        code: 'PATH_TEMPLATE_UNKNOWN_PLACEHOLDER',
        message: `Unknown placeholder {${placeholder}} in pathTemplate`,
        location: `artifacts[${artifactId}].pathTemplate`,
        severity: 'warning',
      });
    }
  }

  return errors;
}

/**
 * Check missing errors[] on mutating routes
 */
function checkMutatingRouteErrors(route: RestRouteDecl): LintError[] {
  const errors: LintError[] = [];

  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (mutatingMethods.includes(route.method) && (!route.errors || route.errors.length === 0)) {
    errors.push({
      code: 'MUTATING_ROUTE_MISSING_ERRORS',
      message: `Mutating route ${route.method} ${route.path} must declare errors[]`,
      location: `rest.routes[${route.method} ${route.path}]`,
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validate schema references
 */
async function validateSchemaRefs(
  schemaRef: SchemaRef | undefined,
  location: string,
  cwd: string
): Promise<LintError[]> {
  const errors: LintError[] = [];

  if (!schemaRef) {
    return [];
  }

  if ('zod' in schemaRef) {
    // Validate Zod schema reference
    const [modulePath, exportName] = schemaRef.zod.split('#');
    if (!exportName || !modulePath) {
      errors.push({
        code: 'SCHEMA_REF_INVALID',
        message: `Schema reference must include export name: ${schemaRef.zod}`,
        location,
        severity: 'error',
      });
      return errors;
    }

    // Check if file exists
    const resolvedPath = modulePath.startsWith('.')
      ? path.join(cwd, modulePath)
      : modulePath;

    try {
      await fs.access(resolvedPath);
    } catch {
      errors.push({
        code: 'SCHEMA_REF_FILE_NOT_FOUND',
        message: `Schema file not found: ${resolvedPath}`,
        location,
        severity: 'error',
      });
    }
  }

  return errors;
}

/**
 * Check handler references
 */
async function validateHandlerRef(
  handlerRef: string,
  location: string,
  cwd: string
): Promise<LintError[]> {
  const errors: LintError[] = [];

  const [modulePath, exportName] = handlerRef.split('#');
  if (!exportName || !modulePath) {
    errors.push({
      code: 'HANDLER_REF_INVALID',
      message: `Handler reference must include export name: ${handlerRef}`,
      location,
      severity: 'error',
    });
    return errors;
  }

  // Check if file exists
  const resolvedPath = modulePath.startsWith('.')
    ? path.join(cwd, modulePath)
    : modulePath;

  try {
    await fs.access(resolvedPath);
  } catch {
    errors.push({
      code: 'HANDLER_REF_FILE_NOT_FOUND',
      message: `Handler file not found: ${resolvedPath}`,
      location,
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validate command examples match flag definitions
 */
function validateCommandExamples(
  command: { id: string; flags?: Array<{ name: string; type: string; choices?: string[]; required?: boolean }>; examples?: string[] },
  group: string
): LintError[] {
  const errors: LintError[] = [];

  // 1. Check if examples exist
  if (!command.examples || command.examples.length === 0) {
    errors.push({
      code: 'COMMAND_MISSING_EXAMPLES',
      message: `Command ${command.id} has no examples`,
      location: `cli.commands[${command.id}].examples`,
      severity: 'warning',
    });
    return errors;
  }

  // 2. Validate each example
  for (const example of command.examples) {
    // Check format: should start with 'kb <group> <command>'
    const expectedPrefix = `kb ${group} ${command.id}`;
    if (!example.startsWith(expectedPrefix)) {
      errors.push({
        code: 'EXAMPLE_INVALID_FORMAT',
        message: `Example should start with "${expectedPrefix}", got: "${example.substring(0, 50)}..."`,
        location: `cli.commands[${command.id}].examples`,
        severity: 'error',
      });
      continue;
    }

    // 3. Extract flags from example
    const flagMatches = example.matchAll(/--([a-z0-9-]+)(?:\s+(?:"([^"]+)"|'([^']+)'|(\S+)))?/g);
    const usedFlags = new Map<string, string | boolean>();

    for (const match of flagMatches) {
      const flagName = match[1];
      const flagValue = match[2] || match[3] || match[4] || true;
      usedFlags.set(flagName || '', flagValue);
    }

    // 4. Check that all used flags exist
    for (const [flagName, flagValue] of usedFlags) {
      const flagDef = command.flags?.find(f => f.name === flagName);

      if (!flagDef) {
        errors.push({
          code: 'EXAMPLE_UNKNOWN_FLAG',
          message: `Example uses unknown flag --${flagName}`,
          location: `cli.commands[${command.id}].examples`,
          severity: 'error',
        });
        continue;
      }

      // 5. Check type match
      if (flagDef.type === 'boolean' && flagValue !== true) {
        errors.push({
          code: 'EXAMPLE_FLAG_TYPE_MISMATCH',
          message: `Boolean flag --${flagName} should not have a value in example`,
          location: `cli.commands[${command.id}].examples`,
          severity: 'warning',
        });
      }

      // 6. Check choices
      if (flagDef.choices && typeof flagValue === 'string') {
        if (!flagDef.choices.includes(flagValue)) {
          errors.push({
            code: 'EXAMPLE_FLAG_INVALID_CHOICE',
            message: `Flag --${flagName} value "${flagValue}" is not in allowed choices: ${flagDef.choices.join(', ')}`,
            location: `cli.commands[${command.id}].examples`,
            severity: 'error',
          });
        }
      }
    }

    // 7. Check required flags are present
    const requiredFlags = command.flags?.filter(f => f.required) || [];
    for (const flagDef of requiredFlags) {
      if (!usedFlags.has(flagDef.name)) {
        errors.push({
          code: 'EXAMPLE_MISSING_REQUIRED_FLAG',
          message: `Example missing required flag --${flagDef.name}`,
          location: `cli.commands[${command.id}].examples`,
          severity: 'warning',
        });
      }
    }
  }

  return errors;
}

/**
 * Lint manifest
 */
export async function lintManifest(
  manifest: ManifestV2,
  cwd: string = process.cwd()
): Promise<LintResult> {
  const errors: LintError[] = [];
  const warnings: LintError[] = [];

  // 1. Validate manifest structure
  const validation = validateManifestV2(manifest);
  if (!validation.valid) {
    for (const zodError of validation.errors) {
      for (const issue of zodError.issues) {
        errors.push({
          code: 'VALIDATION_ERROR',
          message: issue.message,
          location: issue.path.join('.'),
          severity: 'error',
        });
      }
    }
  }

  // 2. Check capabilities
  if (manifest.capabilities && manifest.capabilities.length > 0) {
    // Dynamic import to avoid circular dependency during build
    let validateCapabilityNames: (caps: string[]) => { unknown: string[] };
    try {
      const runtime = await import('@kb-labs/plugin-runtime');
      validateCapabilityNames = runtime.validateCapabilityNames;
    } catch {
      // If plugin-runtime is not available during build, skip capability validation
      validateCapabilityNames = () => ({ unknown: [] });
    }
    const capabilityCheck = validateCapabilityNames(manifest.capabilities);
    if (capabilityCheck.unknown.length > 0) {
      for (const unknown of capabilityCheck.unknown) {
        warnings.push({
          code: 'UNKNOWN_CAPABILITY',
          message: `Unknown capability: ${unknown}`,
          location: 'capabilities',
          severity: 'warning',
        });
      }
    }
  }

  // 3. Check artifacts path templates
  if (manifest.artifacts) {
    for (const artifact of manifest.artifacts) {
      const templateErrors = validatePathTemplate(artifact.pathTemplate, artifact.id);
      warnings.push(...templateErrors);
    }
  }

  // 4. Check mutating routes for errors[]
  if (manifest.rest?.routes) {
    for (const route of manifest.rest.routes) {
      const routeErrors = checkMutatingRouteErrors(route);
      errors.push(...routeErrors);

      // Validate handler reference
      const handlerErrors = await validateHandlerRef(
        route.handler,
        `rest.routes[${route.method} ${route.path}].handler`,
        cwd
      );
      errors.push(...handlerErrors);

      // Validate schema references
      if (route.input) {
        const schemaErrors = await validateSchemaRefs(
          route.input,
          `rest.routes[${route.method} ${route.path}].input`,
          cwd
        );
        errors.push(...schemaErrors);
      }

      if (route.output) {
        const outputSchemaErrors = await validateSchemaRefs(
          route.output,
          `rest.routes[${route.method} ${route.path}].output`,
          cwd
        );
        errors.push(...outputSchemaErrors);
      }
    }
  }

  // 5. Check CLI command handlers
  if (manifest.cli?.commands) {
    for (const command of manifest.cli.commands) {
      const handlerErrors = await validateHandlerRef(
        command.handler,
        `cli.commands[${command.id}].handler`,
        cwd
      );
      errors.push(...handlerErrors);

      // 5a. Validate command examples
      const exampleErrors = validateCommandExamples(command, manifest.group || 'unknown');
      errors.push(...exampleErrors);
    }
  }

  // 6. Check Studio widget components
  if (manifest.studio?.widgets) {
    for (const widget of manifest.studio.widgets) {
      if (widget.component) {
        const componentErrors = await validateHandlerRef(
          widget.component,
          `studio.widgets[${widget.id}].component`,
          cwd
        );
        errors.push(...componentErrors);
      }
    }
  }

  // Separate errors and warnings
  const finalErrors = errors.filter((e) => e.severity === 'error');
  const finalWarnings = [...warnings, ...errors.filter((e) => e.severity === 'warning')];

  return {
    valid: finalErrors.length === 0,
    errors: finalErrors,
    warnings: finalWarnings,
  };
}
