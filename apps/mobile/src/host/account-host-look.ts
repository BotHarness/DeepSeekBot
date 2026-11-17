import type { ConnectHost } from '@botharness/host-client/connect-account';

export function accountHostLookId(connectHost: string): string {
  return `connect-host:${connectHost.toLowerCase()}`;
}

export function accountHostLookTarget(host: ConnectHost) {
  return { hostId: accountHostLookId(host.id), hostName: host.name };
}
