import { cloudError, type CloudClient, type CloudRow } from './client';
import { ClientError, connectionKey } from './instance-contract';

export function cloudViewScope(row: CloudRow | undefined): string {
  return JSON.stringify(
    row ? [connectionKey(row.config), row.hasSession, row.sessionUserId ?? null] : null,
  );
}

export type CloudWorkspace = {
  instanceId: string;
  organizationId: string;
  name: string;
  role: 'owner' | 'member' | 'guest';
};
export type WorkspaceDirectoryEntry = {
  instanceId: string;
  server: string;
  hasSession: boolean;
  workspaces: CloudWorkspace[];
  membersAfter: string | null | undefined;
  guestsAfter: string | null | undefined;
  error?: string | undefined;
};
type DirectoryPort = Pick<CloudClient, 'listOrganizations' | 'listChannels'>;

export function createWorkspaceDirectory(port: DirectoryPort) {
  let state: { busy: boolean; entries: WorkspaceDirectoryEntry[] } = { busy: false, entries: [] };
  let revision = 0;
  let pending = Promise.resolve();
  const listeners = new Set<() => void>();
  const publish = (next: typeof state) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const page = async (entry: WorkspaceDirectoryEntry, epoch: number) => {
    const workspaces = new Map(
      entry.workspaces.map((workspace) => [workspace.organizationId, workspace]),
    );
    let membersAfter = entry.membersAfter;
    let guestsAfter = entry.guestsAfter;
    if (membersAfter !== null) {
      const members = await port.listOrganizations(entry.instanceId, membersAfter);
      if (members.nextCursor && members.nextCursor === membersAfter)
        throw new ClientError('INVALID_RESPONSE');
      membersAfter = members.nextCursor;
      for (const member of members.organizations) {
        workspaces.set(member.organizationId, {
          instanceId: entry.instanceId,
          organizationId: member.organizationId,
          name: member.name,
          role: member.role,
        });
      }
    }
    if (epoch !== revision) return undefined;
    if (guestsAfter !== null) {
      const guests = await port.listChannels(entry.instanceId, '', guestsAfter, true);
      if (guests.nextCursor && guests.nextCursor === guestsAfter)
        throw new ClientError('INVALID_RESPONSE');
      if (epoch !== revision) return undefined;
      guestsAfter = guests.nextCursor;
      for (const channel of guests.channels) {
        if (!channel.organizationId || !channel.organizationName)
          throw new ClientError('INVALID_RESPONSE');
        if (!workspaces.has(channel.organizationId))
          workspaces.set(channel.organizationId, {
            instanceId: entry.instanceId,
            organizationId: channel.organizationId,
            name: channel.organizationName,
            role: 'guest',
          });
      }
    }
    return {
      ...entry,
      workspaces: [...workspaces.values()],
      membersAfter,
      guestsAfter,
      error: undefined,
    };
  };
  const schedule = (entries: WorkspaceDirectoryEntry[], epoch: number) => {
    pending = pending.then(async () => {
      for (const entry of entries) {
        if (epoch !== revision) return;
        if (!entry.hasSession) continue;
        let next: WorkspaceDirectoryEntry | undefined;
        try {
          next = await page(entry, epoch);
        } catch (error) {
          next = { ...entry, error: cloudError(error) };
        }
        if (epoch !== revision || !next) return;
        const result = next;
        publish({
          busy: true,
          entries: state.entries.map((row) =>
            row.instanceId === result.instanceId ? result : row,
          ),
        });
      }
      if (epoch === revision) publish({ ...state, busy: false });
    });
    return pending;
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh(rows: readonly CloudRow[]) {
      const entries = rows.map((row): WorkspaceDirectoryEntry => ({
        instanceId: row.config.instanceId,
        server: row.config.server,
        hasSession: row.hasSession,
        workspaces: [],
        membersAfter: undefined,
        guestsAfter: undefined,
      }));
      publish({ busy: true, entries });
      return schedule(entries, ++revision);
    },
    more(instanceId: string) {
      if (state.busy) return pending;
      const entry = state.entries.find((row) => row.instanceId === instanceId);
      if (!entry) return Promise.resolve();
      publish({ ...state, busy: true });
      return schedule([entry], revision);
    },
    clear() {
      revision++;
      publish({ busy: false, entries: [] });
    },
  };
}
