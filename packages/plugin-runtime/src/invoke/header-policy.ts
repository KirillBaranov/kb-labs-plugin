/**
 * @module @kb-labs/plugin-runtime/invoke/header-policy
 * Resolve header policies for target routes during cross-plugin invocation.
 */

import type { ManifestV2, HeaderPolicy, HeaderRule } from '@kb-labs/plugin-manifest';

export interface ResolvedHeaderPolicy {
  defaults: 'deny' | 'allowSafe';
  inbound: HeaderRule[];
  outbound: HeaderRule[];
  allowList: string[];
  denyList: string[];
}

const DEFAULT_POLICY: 'deny' = 'deny';

function normalizeHeaderName(name: string): string {
  return name.toLowerCase();
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

export function resolveRouteHeaderPolicy(
  manifest: ManifestV2,
  method: string,
  path: string
): ResolvedHeaderPolicy | undefined {
  const headers = (manifest as { headers?: { defaults?: HeaderPolicy; routes?: Array<{ routeId: string; policy: HeaderPolicy }> } }).headers;
  if (!headers) {
    return undefined;
  }

  const basePath = manifest.rest?.basePath || `/v1/plugins/${manifest.id}`;
  const defaultsPolicy = headers.defaults;
  const routes = headers.routes ?? [];

  const effectiveEntry = routes.find((entry) => {
    const normalized = normalizeRouteId(entry.routeId);
    const [routeMethod, routePath] = normalized.split(' ');
    if (!routeMethod || !routePath) {
      return false;
    }
    if (routeMethod !== method.toUpperCase()) {
      return false;
    }
    const normalizedTarget = normalizePath(path);
    const normalizedRoute = normalizePath(routePath);
    if (normalizedRoute === normalizedTarget) {
      return true;
    }
    const relativeTarget = normalizedTarget.startsWith(basePath)
      ? normalizePath(normalizedTarget.slice(basePath.length))
      : normalizedTarget;
    return normalizedRoute === relativeTarget;
  });

  const defaultsValue = effectiveEntry?.policy.defaults ?? defaultsPolicy?.defaults ?? DEFAULT_POLICY;
  const inbound = mergeRules(defaultsPolicy?.inbound, effectiveEntry?.policy.inbound);
  const outbound = mergeRules(defaultsPolicy?.outbound, effectiveEntry?.policy.outbound);

  const allowList = new Set<string>();
  const denyList = new Set<string>();

  for (const name of defaultsPolicy?.allowList ?? []) {
    allowList.add(normalizeHeaderName(name));
  }
  for (const name of effectiveEntry?.policy.allowList ?? []) {
    allowList.add(normalizeHeaderName(name));
  }

  for (const name of defaultsPolicy?.denyList ?? []) {
    denyList.add(normalizeHeaderName(name));
  }
  for (const name of effectiveEntry?.policy.denyList ?? []) {
    denyList.add(normalizeHeaderName(name));
  }

  if (!effectiveEntry && inbound.length === 0 && outbound.length === 0 && allowList.size === 0 && denyList.size === 0) {
    return defaultsPolicy
      ? {
          defaults: defaultsValue,
          inbound,
          outbound,
          allowList: Array.from(allowList),
          denyList: Array.from(denyList),
        }
      : undefined;
  }

  return {
    defaults: defaultsValue,
    inbound,
    outbound,
    allowList: Array.from(allowList),
    denyList: Array.from(denyList),
  };
}

function mergeRules(base?: HeaderRule[], override?: HeaderRule[]): HeaderRule[] {
  if (!base && !override) {
    return [];
  }
  const result: HeaderRule[] = [];
  const seen = new Set<string>();
  const all = [...(base ?? []), ...(override ?? [])];
  for (const rule of all) {
    const key = ruleKey(rule);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(rule);
    }
  }
  return result;
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

export function matchesRule(rule: HeaderRule, headerName: string): boolean {
  const normalized = normalizeHeaderName(headerName);
  const match = rule.match;
  switch (match.kind) {
    case 'exact':
      return normalized === normalizeHeaderName(match.name);
    case 'prefix':
      return normalized.startsWith(normalizeHeaderName(match.prefix));
    case 'regex': {
      const flags = match.flags ?? '';
      const regex = new RegExp(match.pattern, flags.includes('i') ? flags : `${flags}i`);
      return regex.test(headerName);
    }
    default:
      return false;
  }
}

