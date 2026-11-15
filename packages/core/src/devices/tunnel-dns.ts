import { lookup, Resolver } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { CONNECT_HOSTNAME } from './connect-zones.js';

type QueryIpv4 = (
  hostname: string,
  callback: (error: NodeJS.ErrnoException | null, addresses: string[]) => void,
) => void;

const queryIpv4: QueryIpv4 = (hostname, callback) => {
  const resolver = new Resolver({ timeout: 1500, tries: 1 });
  resolver.resolve4(hostname, callback);
};

export function createTunnelLookup(
  options: {
    systemLookup?: LookupFunction;
    query?: QueryIpv4;
    onRecovery?(): void;
  } = {},
): LookupFunction {
  const systemLookup = options.systemLookup ?? lookup;
  const query = options.query ?? queryIpv4;
  return (hostname, settings, callback) => {
    systemLookup(hostname, settings, (error, address, family) => {
      if (
        error?.code !== 'ENOTFOUND' ||
        !(CONNECT_HOSTNAME.test(hostname) || /^[a-z0-9-]+\.trycloudflare\.com$/u.test(hostname)) ||
        settings.family === 6
      ) {
        callback(error, address, family);
        return;
      }
      query(hostname, (dnsError, addresses) => {
        if (dnsError || !addresses.length) {
          callback(error, address, family);
          return;
        }
        options.onRecovery?.();
        callback(
          null,
          settings.all ? addresses.map((value) => ({ address: value, family: 4 })) : addresses[0]!,
          4,
        );
      });
    });
  };
}
