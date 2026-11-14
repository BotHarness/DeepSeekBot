import { CONNECT_HOSTNAME } from './connect-zones.js';
import { createTrustFetch, systemTrustedCertificates } from './private-tunnel.js';
import { createTunnelLookup } from './tunnel-dns.js';

const identityFetch = createTrustFetch(systemTrustedCertificates, createTunnelLookup());

export function requestConnectIdentity(url: string, init?: RequestInit): Promise<Response> {
  const target = new URL(url);
  if (
    target.protocol === 'https:' &&
    CONNECT_HOSTNAME.test(target.hostname) &&
    !target.port &&
    !target.username &&
    !target.password &&
    !target.search &&
    !target.hash &&
    target.pathname === '/botharness-device/channel' &&
    (!init?.method || init.method === 'GET') &&
    init?.body === undefined &&
    [...new Headers(init?.headers)].length === 0
  ) {
    return identityFetch(url, { signal: init?.signal ?? AbortSignal.timeout(8000) });
  }
  return fetch(url, init);
}
