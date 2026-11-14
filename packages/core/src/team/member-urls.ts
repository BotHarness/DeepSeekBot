import { isIPv4 } from 'node:net';
import { isLanAddress } from '../devices/lan-address.js';

export function memberUrls(addresses: string[], insecureHttpAllowed: boolean): string[] {
  return addresses.filter((address) => {
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
      return (
        url.protocol === 'https:' ||
        (insecureHttpAllowed && url.protocol === 'http:' && isLanAddress(host))
      );
    } catch {
      return false;
    }
  });
}
