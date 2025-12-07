/**
 * @module @kb-labs/plugin-adapter-rest/header-policy
 * Helpers for resolving header policies for manifests/routes
 */

import type { ManifestV2, RestRouteDecl } from '@kb-labs/plugin-manifest';

export type HeaderMatch =
  | { kind: 'exact'; name: string }
  | { kind: 'prefix'; prefix: string }
  | { kind: 'regex'; pattern: string; flags?: string };

export type HeaderValidator =
  | { kind: 'regex'; pattern: string; flags?: string }
  | { kind: 'enum'; values: string[] }
  | { kind: 'length'; min?: number; max?: number };

export interface HeaderRule {
  match: HeaderMatch;
  direction?: 'in' | 'out' | 'both';
  action: 'forward' | 'strip' | 'map';
  mapTo?: string;
  sensitive?: boolean;
  validators?: HeaderValidator[];
  required?: boolean;
  redactInErrors?: boolean;
  exposeToStudio?: boolean;
  cacheVary?: boolean;
  rateLimitKey?: boolean;
  transform?: string;
}

export interface HeaderPolicy {
  schema?: 'kb.headers/1';
  defaults?: 'deny' | 'allowSafe';
  inbound?: HeaderRule[];
  outbound?: HeaderRule[];
  allowList?: string[];
  denyList?: string[];
  maxHeaders?: number;
  maxHeaderBytes?: number;
  maxValueBytes?: number;
}

export interface SecurityHeaders {
  cors?: {
    allowOrigins?: string[] | '*';
    allowHeaders?: string[];
    exposeHeaders?: string[];
  };
  hsts?: {
    enabled: boolean;
    maxAge: number;
    includeSubDomains?: boolean;
  };
  cookies?: {
    sameSite?: 'Lax' | 'Strict' | 'None';
    secure?: boolean;
    httpOnly?: boolean;
  };
  csp?: string;
  referrerPolicy?: string;
}

export interface HeadersConfig {
  version?: 1;
  defaults?: HeaderPolicy;
  routes?: Array<{
    routeId: string;
    policy: HeaderPolicy;
  }>;
  security?: SecurityHeaders;
  profile?: string;
}

export interface ResolvedHeaderPolicy {
  defaults: 'deny' | 'allowSafe';
  inbound: HeaderRule[];
  outbound: HeaderRule[];
  allowList: string[];
  denyList: string[];
  security?: SecurityHeaders;
}

const DEFAULT_POLICY: 'deny' = 'deny';

function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
}

function ruleKey(rule: HeaderRule): string {
  const { match } = rule;
  switch (match.kind) {
    case 'exact':
      return `exact:${normalizeHeaderName(match.name)}`;
    case 'prefix':
      return `prefix:${normalizeHeaderName(match.prefix)}`;
    case 'regex':
      return `regex:${match.pattern}:${match.flags ?? ''}`;
    default:
      return JSON.stringify(match);
  }
}

function mergeRules(base?: HeaderRule[], override?: HeaderRule[]): HeaderRule[] {
  if (!base && !override) {
    return [];
  }
  const map = new Map<string, HeaderRule>();
  if (base) {
    for (const rule of base) {
      map.set(ruleKey(rule), rule);
    }
  }
  if (override) {
    for (const rule of override) {
      map.set(ruleKey(rule), rule);
    }
  }
  return Array.from(map.values());
}

function normalizePath(path: string): string {
  if (!path) {
    return '/';
  }
  let normalized = path;
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (normalized !== '/' && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function normalizeRouteId(routeId: string): string {
  const trimmed = routeId.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) {
    return `${trimmed.toUpperCase()} /`;
  }
  const method = trimmed.slice(0, spaceIdx).toUpperCase();
  const path = normalizePath(trimmed.slice(spaceIdx + 1));
  return `${method} ${path}`;
}

function matchesRouteId(routeId: string, route: RestRouteDecl, basePath: string): boolean {
  const normalizedRouteId = normalizeRouteId(routeId);
  const method = route.method.toUpperCase();
  const pathCandidates = new Set<string>();

  const rawPath = normalizePath(route.path);
  pathCandidates.add(`${method} ${rawPath}`);

  const absolutePath = normalizePath(
    route.path.startsWith(basePath) ? route.path : `${basePath}${route.path.startsWith('/') ? route.path : `/${route.path}`}`
  );
  pathCandidates.add(`${method} ${absolutePath}`);

  if (absolutePath.startsWith(basePath)) {
    const relative = absolutePath.slice(basePath.length) || '/';
    pathCandidates.add(`${method} ${normalizePath(relative)}`);
  }

  return pathCandidates.has(normalizedRouteId);
}

export function resolveHeaderPolicy(
  manifest: ManifestV2,
  route: RestRouteDecl,
  basePath: string
): ResolvedHeaderPolicy | undefined {
  const headers = (manifest as { headers?: HeadersConfig }).headers;
  if (!headers) {
    return undefined;
  }

  const defaultsPolicy: HeaderPolicy | undefined = headers.defaults;
  const routePolicyEntry = headers.routes?.find((entry) =>
    matchesRouteId(entry.routeId, route, basePath)
  );
  const routePolicy = routePolicyEntry?.policy;

  const defaultsValue = routePolicy?.defaults ?? defaultsPolicy?.defaults ?? DEFAULT_POLICY;

  const inbound = mergeRules(defaultsPolicy?.inbound, routePolicy?.inbound);
  const outbound = mergeRules(defaultsPolicy?.outbound, routePolicy?.outbound);

  const allowList = new Set<string>();
  const denyList = new Set<string>();

  for (const name of defaultsPolicy?.allowList ?? []) {
    allowList.add(normalizeHeaderName(name));
  }
  for (const name of routePolicy?.allowList ?? []) {
    allowList.add(normalizeHeaderName(name));
  }

  for (const name of defaultsPolicy?.denyList ?? []) {
    denyList.add(normalizeHeaderName(name));
  }
  for (const name of routePolicy?.denyList ?? []) {
    denyList.add(normalizeHeaderName(name));
  }

  return {
    defaults: defaultsValue,
    inbound,
    outbound,
    allowList: Array.from(allowList),
    denyList: Array.from(denyList),
    security: headers.security,
  };
}

type MatchFn = (name: string) => boolean;

export interface CompiledHeaderValidatorRegex {
  kind: 'regex';
  regex: RegExp;
}

export interface CompiledHeaderValidatorEnum {
  kind: 'enum';
  values: Set<string>;
}

export interface CompiledHeaderValidatorLength {
  kind: 'length';
  min?: number;
  max?: number;
}

export type CompiledHeaderValidator =
  | CompiledHeaderValidatorRegex
  | CompiledHeaderValidatorEnum
  | CompiledHeaderValidatorLength;

export interface CompiledHeaderRule extends HeaderRule {
  matchFn: MatchFn;
  targetName?: string;
  validatorsCompiled: CompiledHeaderValidator[];
  transformPipeline?: string;
  transformModule?: {
    modulePath: string;
    exportName: string;
  };
}

export interface CompiledHeaderPolicy {
  defaults: 'deny' | 'allowSafe';
  inbound: CompiledHeaderRule[];
  outbound: CompiledHeaderRule[];
  allowList: Set<string>;
  denyList: Set<string>;
  security?: SecurityHeaders;
}

function compileMatchFn(rule: HeaderRule): MatchFn {
  const { match } = rule;
  switch (match.kind) {
    case 'exact': {
      const target = normalizeHeaderName(match.name);
      return (name) => normalizeHeaderName(name) === target;
    }
    case 'prefix': {
      const prefix = normalizeHeaderName(match.prefix);
      return (name) => normalizeHeaderName(name).startsWith(prefix);
    }
    case 'regex': {
      const flags = match.flags ?? '';
      const regex = new RegExp(match.pattern, flags.includes('i') ? flags : `${flags}i`);
      return (name) => regex.test(name);
    }
    default: {
      return () => false;
    }
  }
}

function compileValidator(validator: HeaderValidator): CompiledHeaderValidator {
  switch (validator.kind) {
    case 'regex': {
      const flags = validator.flags ?? '';
      const regex = new RegExp(validator.pattern, flags.includes('i') ? flags : `${flags}i`);
      return { kind: 'regex', regex };
    }
    case 'enum': {
      const values = new Set(validator.values.map((value) => value.toLowerCase()));
      return { kind: 'enum', values };
    }
    case 'length': {
      return {
        kind: 'length',
        min: validator.min,
        max: validator.max,
      };
    }
    default: {
      const exhaustive: never = validator;
      return exhaustive;
    }
  }
}

function parseTransformSpec(
  transform: string | undefined
): { pipeline?: string; module?: { modulePath: string; exportName: string } } {
  if (!transform) {
    return {};
  }

  const spec = transform.trim();
  if (spec.toLowerCase().startsWith('module:')) {
    const remainder = spec.slice('module:'.length).trim();
    if (!remainder) {
      throw new Error('module: transform requires module path (e.g., module:./file.js#exportName)');
    }
    const [modulePathRaw, exportNameRaw] = remainder.split('#');
    const modulePath = modulePathRaw?.trim();
    const exportName = (exportNameRaw ?? 'default').trim();
    if (!modulePath) {
      throw new Error(`Invalid module transform spec "${spec}": missing module path`);
    }
    if (!exportName) {
      throw new Error(`Invalid module transform spec "${spec}": missing export name`);
    }
    return {
      module: {
        modulePath,
        exportName,
      },
    };
  }

  return { pipeline: spec };
}

function compileRule(rule: HeaderRule): CompiledHeaderRule {
  const matchFn = compileMatchFn(rule);
  const validatorsCompiled = (rule.validators ?? []).map(compileValidator);
  const targetName =
    rule.action === 'map'
      ? normalizeHeaderName(rule.mapTo || '')
      : rule.match.kind === 'exact'
        ? normalizeHeaderName(rule.match.name)
        : undefined;

  const { pipeline, module } = parseTransformSpec(rule.transform);

  return {
    ...rule,
    matchFn,
    targetName,
    validatorsCompiled,
    transformPipeline: pipeline,
    transformModule: module,
  };
}

export function compileHeaderPolicy(policy: ResolvedHeaderPolicy): CompiledHeaderPolicy {
  return {
    defaults: policy.defaults,
    inbound: policy.inbound.map(compileRule),
    outbound: policy.outbound.map(compileRule),
    allowList: new Set(policy.allowList.map(normalizeHeaderName)),
    denyList: new Set(policy.denyList.map(normalizeHeaderName)),
    security: policy.security,
  };
}

