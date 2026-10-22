import { sameAccount, type AccountOwner } from './account-owner';
import { withoutHost, type SavedHost, type SavedHosts } from './hosts';

export async function removeAccountConnections(options: {
  owner: AccountOwner;
  state: SavedHosts;
  persist(next: SavedHosts): Promise<void>;
  adopt(next: SavedHosts): void;
  clearLocal(host: SavedHost): Promise<void>;
}): Promise<void> {
  const removed = options.state.hosts.filter((host) =>
    sameAccount(host.accountOwner, options.owner),
  );
  const pending = [...(options.state.pendingAccountRemoval ?? []), ...removed];
  const owned = pending.filter((host) => sameAccount(host.accountOwner, options.owner));
  if (!owned.length) return;
  const next = {
    ...removed.reduce((state, host) => withoutHost(state, host.hostId), options.state),
    pendingAccountRemoval: pending,
  };
  await options.persist(next);
  options.adopt(next);
  await Promise.all(owned.map(options.clearLocal));
  const { pendingAccountRemoval: _pending, ...rest } = next;
  const remaining = pending.filter((host) => !sameAccount(host.accountOwner, options.owner));
  const complete = { ...rest, ...(remaining.length ? { pendingAccountRemoval: remaining } : {}) };
  await options.persist(complete);
  options.adopt(complete);
}
