import type { ConnectHost } from './connect-account';
import type { SavedHost } from './hosts';
import type { PairingFailure } from './pairing';

export function accountHostAdded(host: ConnectHost, saved: readonly SavedHost[]): boolean {
  return saved.some((entry) =>
    entry.routes.some((route) => {
      try {
        return new URL(route).origin === `https://${host.hostname}`;
      } catch {
        return false;
      }
    }),
  );
}

export async function pairAccountSelection(options: {
  hosts: readonly ConnectHost[];
  signal: AbortSignal;
  pair(host: ConnectHost): Promise<PairingFailure | undefined>;
  result(host: ConnectHost, result: PairingFailure | 'added'): void;
}): Promise<void> {
  const seen = new Set<string>();
  for (const host of options.hosts) {
    if (options.signal.aborted) break;
    if (seen.has(host.id)) continue;
    seen.add(host.id);
    const result = host.online ? await options.pair(host) : 'host-offline';
    if (options.signal.aborted) break;
    options.result(host, result ?? 'added');
    if (result === 'cancelled' || result === 'host-key-confirmation-required') break;
  }
}
