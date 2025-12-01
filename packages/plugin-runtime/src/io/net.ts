/**
 * @module @kb-labs/plugin-runtime/io/net
 * Network client with host/CIDR whitelisting
 */

import type { PermissionSpec } from '@kb-labs/plugin-manifest';

/**
 * Check if IP address is in CIDR block
 * @param ip - IP address (e.g., '192.168.1.10')
 * @param cidr - CIDR block (e.g., '192.168.1.0/24')
 * @returns True if IP is in CIDR block
 */
function isIpInCidr(ip: string, cidr: string): boolean {
  const parts = cidr.split('/');
  const network = parts[0];
  const prefixLengthStr = parts[1];
  
  if (!network) {
    return false;
  }
  
  const prefixLength = parseInt(prefixLengthStr || '32', 10);

  // Convert IP to number
  const ipToNumber = (ip: string): number => {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4) return 0;
    const [a, b, c, d] = parts;
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      return 0;
    }
    return (
      a * 256 ** 3 +
      b * 256 ** 2 +
      c * 256 +
      d
    );
  };

  const networkNum = ipToNumber(network);
  const ipNum = ipToNumber(ip);
  const mask = ~(2 ** (32 - prefixLength) - 1);

  return (networkNum & mask) === (ipNum & mask);
}

/**
 * Check if host is allowed by network permissions
 * @param host - Hostname or IP address
 * @param perms - Network permissions
 * @returns True if host is allowed
 */
export function isHostAllowed(
  host: string,
  perms: PermissionSpec['net']
): boolean {
  if (!perms || perms === 'none') {
    return false;
  }

  // Normalize host (remove protocol, port, path)
  let normalizedHost = host.toLowerCase();
  normalizedHost = normalizedHost.replace(/^https?:\/\//, '');
  const portPart = normalizedHost.split(':')[0];
  normalizedHost = portPart || normalizedHost; // Remove port
  const pathPart = normalizedHost.split('/')[0];
  normalizedHost = pathPart || normalizedHost; // Remove path

  // Check denyHosts first (deny takes precedence)
  if (perms.denyHosts && perms.denyHosts.length > 0) {
    for (const denied of perms.denyHosts) {
      const deniedNormalized = denied.toLowerCase();
      // Exact match
      if (deniedNormalized === normalizedHost) {
        return false;
      }
      // Wildcard match (e.g., *.example.com)
      if (deniedNormalized.startsWith('*.')) {
        const domain = deniedNormalized.slice(2);
        if (
          normalizedHost === domain ||
          normalizedHost.endsWith(`.${domain}`)
        ) {
          return false;
        }
      }
    }
  }

  // Check allowHosts
  if (perms.allowHosts && perms.allowHosts.length > 0) {
    for (const allowed of perms.allowHosts) {
      const allowedNormalized = allowed.toLowerCase();
      // Exact match
      if (allowedNormalized === normalizedHost) {
        return true;
      }
      // Wildcard match
      if (allowedNormalized.startsWith('*.')) {
        const domain = allowedNormalized.slice(2);
        if (
          normalizedHost === domain ||
          normalizedHost.endsWith(`.${domain}`)
        ) {
          return true;
        }
      }
    }
  }

  // Check CIDR blocks (if host is an IP address)
  if (perms.allowCidrs && perms.allowCidrs.length > 0) {
    // Simple check: if normalizedHost looks like an IP
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(normalizedHost)) {
      for (const cidr of perms.allowCidrs) {
        if (isIpInCidr(normalizedHost, cidr)) {
          return true;
        }
      }
    }
  }

  // If allowHosts is specified but no match, deny
  if (perms.allowHosts && perms.allowHosts.length > 0) {
    return false;
  }

  // If no allowHosts, deny by default
  return false;
}

/**
 * Create whitelisted fetch function
 * @param perms - Network permissions
 * @param baseFetch - Base fetch implementation (default: global fetch)
 * @param ctx - Execution context (for dry-run mode)
 * @returns Whitelisted fetch function
 */
export function createWhitelistedFetch(
  perms: PermissionSpec['net'],
  baseFetch: typeof fetch = globalThis.fetch,
  ctx?: { dryRun?: boolean }
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    // Parse URL
    let url: URL;
    if (typeof input === 'string') {
      url = new URL(input);
    } else if (input instanceof URL) {
      url = input;
    } else {
      // Request object
      const requestUrl = input.url;
      if (!requestUrl) {
        throw new Error('Request URL is required');
      }
      url = new URL(requestUrl);
    }
    const host = url.hostname;

    // Check if host is allowed
    if (!isHostAllowed(host, perms)) {
      throw new Error(
        `Network access denied: host "${host}" is not in allowedHosts`
      );
    }

    // Dry-run mode: log operation instead of executing
    if (ctx?.dryRun) {
      const method = init?.method || 'GET';
      console.log(`[DRY-RUN] Would ${method} to: ${url.href}`);
      
      // Return mock response
      return new Response(JSON.stringify({ dryRun: true, url: url.href }), {
        status: 200,
        statusText: 'OK (dry-run)',
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Apply per-request timeout
    const timeoutMs = perms && perms !== 'none' ? perms.timeoutMs : undefined;
    
    if (timeoutMs) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      // Merge abort signals
      const signal = init?.signal
        ? (() => {
            const merged = new AbortController();
            init.signal!.addEventListener('abort', () => merged.abort());
            controller.signal.addEventListener('abort', () => merged.abort());
            return merged.signal;
          })()
        : controller.signal;

      try {
        const response = await baseFetch(input, { ...init, signal });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`Network request timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
    }

    return baseFetch(input, init);
  };
}

