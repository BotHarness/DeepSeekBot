import { isLanAddress } from '../../../../packages/core/src/devices/lan-address';
export type RouteCheck = { ok: true; origin: string } | { ok: false; reason: string };

const isLoopbackHostname = (hostname: string): boolean =>
  hostname === 'localhost' || hostname === '[::1]' || /^127\.\d+\.\d+\.\d+$/u.test(hostname);

const isTailscaleHostname = (hostname: string): boolean =>
  hostname.endsWith('.ts.net') ||
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d+\.\d+$/u.test(hostname);

export function checkRoute(input: string): RouteCheck {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return {
      ok: false,
      reason: 'Enter the Host address, for example https://my-mac.tailnet.ts.net',
    };
  }
  const name = url.hostname;
  const loopback = isLoopbackHostname(name);
  const tailnet = isTailscaleHostname(name);
  const connect = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.deepseekbot\.dev$/u.test(name);
  const allowed =
    (isLanAddress(name) && url.protocol === 'http:' && url.port !== '') ||
    (loopback && (url.protocol === 'http:' || url.protocol === 'https:')) ||
    ((tailnet || (connect && url.port === '')) && url.protocol === 'https:');
  if (
    !allowed ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  )
    return {
      ok: false,
      reason:
        'Use a Tailscale HTTPS address (*.ts.net), a Connect address (*.deepseekbot.dev) or a loopback address, without a path.',
    };
  return { ok: true, origin: url.origin };
}

export function socketOrigin(origin: string): string {
  return origin.replace(/^http/u, 'ws');
}

export function isConnectRoute(route: string): boolean {
  try {
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.deepseekbot\.dev$/u.test(
      new URL(route).hostname,
    );
  } catch {
    return false;
  }
}

export function isLanRoute(route: string): boolean {
  try {
    const url = new URL(route);
    return url.protocol === 'http:' && isLanAddress(url.hostname) && url.port !== '';
  } catch {
    return false;
  }
}

export function isLoopbackRoute(route: string): boolean {
  try {
    return isLoopbackHostname(new URL(route).hostname);
  } catch {
    return false;
  }
}

export function isTailscaleRoute(route: string): boolean {
  try {
    return isTailscaleHostname(new URL(route).hostname);
  } catch {
    return false;
  }
}

export function isEncryptedRoute(route: string, encryption?: { loopback?: 'encrypted' }): boolean {
  if (isConnectRoute(route) || isLanRoute(route)) return true;
  return encryption?.loopback === 'encrypted' && isLoopbackRoute(route);
}
