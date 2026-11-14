import type { ConnectAccount, ConnectHost } from './connect-account';
import {
  connectionDiagnostic,
  networkDiagnosticReason,
  type ConnectionDiagnostic,
} from './connection-diagnostic';

export function watchAccountHosts(options: {
  account: Pick<ConnectAccount, 'actionKey' | 'hosts'>;
  update(hosts: ConnectHost[]): void;
  failed(failure: ConnectionDiagnostic | undefined): void;
  busy?(value: boolean): void;
  onResume(refresh: () => void): () => void;
}): { refresh(): void; close(): void } {
  let active = true;
  let pending = false;
  let repeat = false;
  let owner: string | null | undefined;
  options.update([]);
  options.failed(undefined);
  const refresh = () => {
    if (!active) return;
    if (pending) {
      repeat = true;
      return;
    }
    pending = true;
    options.busy?.(true);
    let readingOwner = true;
    void (async () => {
      const current = await options.account.actionKey();
      if (!active) return;
      if (owner !== current) {
        owner = current;
        options.update([]);
      }
      if (current === null) {
        options.failed(undefined);
        return;
      }
      readingOwner = false;
      const listed = await options.account.hosts();
      readingOwner = true;
      const after = await options.account.actionKey();
      if (!active) return;
      if (after !== current) {
        owner = after;
        options.update([]);
        options.failed(undefined);
        return;
      }
      if (listed.ok) {
        options.update(listed.value);
        options.failed(undefined);
      } else
        options.failed(
          listed.diagnostic ??
            connectionDiagnostic({ code: listed.code, phase: 'environment-list' }),
        );
    })()
      .catch((error: unknown) => {
        if (!active) return;
        options.update([]);
        options.failed(
          connectionDiagnostic({
            code: readingOwner ? 'storage-failure' : 'relay-unavailable',
            phase: readingOwner ? 'account' : 'environment-list',
            detail: `app:${readingOwner ? 'storage-keychain' : networkDiagnosticReason(error)}`,
          }),
        );
      })
      .finally(() => {
        pending = false;
        if (active) options.busy?.(false);
        if (active && repeat) {
          repeat = false;
          refresh();
        }
      });
  };
  const unsubscribe = options.onResume(refresh);
  refresh();
  return {
    refresh,
    close() {
      active = false;
      unsubscribe();
    },
  };
}
