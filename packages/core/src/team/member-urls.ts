import { isIPv4 } from 'node:net';
import type { RouteStatus } from '../devices/routes.js';

export function memberRoutes(origin: string, status: RouteStatus): string[] {
  return memberUrls([
    ...(origin.startsWith('https:') ? [origin] : []),
    ...status.routes
      .filter(
        (route) =>
          route.ready &&
          (route.kind === 'connect' ||
            (route.kind === 'tailscale' && route.memberSignIn === 'managed-tls')),
      )
      .map((route) => route.url),
  ]);
}

export function memberUrls(addresses: string[]): string[] {
  return [...new Set(addresses)].filter((address) => {
    try {
      const url = new URL(address);
      if (url.username || url.password || url.search || url.hash) return false;
      const host = url.hostname.replace(/\.$/u, '');
      const ip = host.replace(/^\[|\]$/gu, '');
      if (
        host === 'localhost' ||
        host.endsWith('.localhost') ||
        ip === '::' ||
        ip === '::1' ||
        (isIPv4(ip) && (ip.startsWith('127.') || ip.startsWith('0.')))
      )
        return false;
      const mapped = /^::ffff:([a-f0-9]+):([a-f0-9]+)$/u.exec(ip);
      const mappedFirst = mapped ? Number.parseInt(mapped[1] ?? '', 16) : undefined;
      if (mappedFirst !== undefined && (mappedFirst >> 8 === 127 || mappedFirst >> 8 === 0))
        return false;
      return url.protocol === 'https:';
    } catch {
      return false;
    }
  });
}
