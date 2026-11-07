import type { ConnectHost } from './connect-account';

export function accountHostLookId(hostname: string): string {
  return `connect-host:${hostname.toLowerCase()}`;
}

export function accountHostLookTarget(host: ConnectHost) {
  return { hostId: accountHostLookId(host.hostname), hostName: host.name };
}
