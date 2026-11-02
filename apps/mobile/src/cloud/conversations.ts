import { canRetainCloudCache, cloudError, type CloudClient, type CloudRow } from './client';
import { cloudViewScope } from './workspace-directory';
import type { CloudChannel } from './channel-contract';
import { ClientError } from './instance-contract';

export type CloudConversation = {
  key: string;
  scope: string;
  instanceId: string;
  organizationId: string;
  organizationName: string;
  guest: boolean;
  channel: CloudChannel;
};
type Port = Pick<CloudClient, 'listOrganizations' | 'listConversationChannels'>;
export type ConversationWorkspace = Pick<
  CloudConversation,
  'scope' | 'instanceId' | 'organizationId' | 'organizationName' | 'guest'
> & { server: string; role?: 'owner' | 'member' };
type Snapshot = {
  busy: boolean;
  ready: boolean;
  rows: CloudConversation[];
  workspaces: ConversationWorkspace[];
  errors: string[];
};

export function createCloudConversations(port: Port) {
  let sources: readonly CloudRow[] = [];
  let signature = '';
  let epoch = 0;
  let state: Snapshot = { busy: false, ready: false, rows: [], workspaces: [], errors: [] };
  let runningEpoch = 0;
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: Snapshot) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const validScopes = () =>
    new Set(sources.filter((r) => r.hasSession && r.sessionUserId).map(cloudViewScope));
  async function collect(source: CloudRow, version: number) {
    const scope = cloudViewScope(source);
    const result = new Map<string, CloudConversation>();
    const workspaces = new Map<string, ConversationWorkspace>();
    const addWorkspace = (
      organizationId: string,
      organizationName: string,
      guest: boolean,
      role?: 'owner' | 'member',
    ) => {
      if (!workspaces.has(organizationId))
        workspaces.set(organizationId, {
          scope,
          instanceId: source.config.instanceId,
          server: source.config.server,
          organizationId,
          organizationName,
          guest,
          ...(role ? { role } : {}),
        });
    };
    const add = (
      channel: CloudChannel,
      organizationId: string,
      organizationName: string,
      guest: boolean,
    ) => {
      addWorkspace(organizationId, organizationName, guest);
      const key = JSON.stringify(['cloud', scope, organizationId, channel.channelId]);
      if (!result.has(key))
        result.set(key, {
          key,
          scope,
          instanceId: source.config.instanceId,
          organizationId,
          organizationName,
          guest,
          channel,
        });
    };
    const pages = async <T>(
      load: (after?: string) => Promise<{ values: T[]; nextCursor: string | null }>,
      accept: (values: T[]) => Promise<void>,
    ) => {
      const seen = new Set<string>();
      let after: string | undefined;
      do {
        if (version !== epoch) return;
        const page = await load(after);
        if (version !== epoch) return;
        await accept(page.values);
        if (!page.nextCursor) return;
        if (seen.has(page.nextCursor)) throw new ClientError('INVALID_RESPONSE');
        seen.add(page.nextCursor);
        after = page.nextCursor;
      } while (version === epoch);
    };
    await pages(
      async (after) => {
        const p = await port.listOrganizations(source.config.instanceId, after);
        return { values: p.organizations, nextCursor: p.nextCursor };
      },
      async (organizations) => {
        for (const org of organizations) {
          addWorkspace(org.organizationId, org.name, false, org.role);
          await pages(
            async (after) => {
              const p = await port.listConversationChannels(
                source.config.instanceId,
                org.organizationId,
                after,
              );
              return { values: p.channels, nextCursor: p.nextCursor };
            },
            async (channels) => {
              for (const c of channels) add(c, org.organizationId, org.name, false);
            },
          );
        }
      },
    );
    await pages(
      async (after) => {
        const p = await port.listConversationChannels(source.config.instanceId, '', after, true);
        return { values: p.channels, nextCursor: p.nextCursor };
      },
      async (channels) => {
        for (const c of channels) {
          if (!c.organizationId || !c.organizationName) throw new ClientError('INVALID_RESPONSE');
          add(c, c.organizationId, c.organizationName, true);
        }
      },
    );
    return { rows: [...result.values()], workspaces: [...workspaces.values()] };
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enroll(rows: readonly CloudRow[]) {
      const next = JSON.stringify(rows.map(cloudViewScope));
      sources = rows;
      if (next === signature) return;
      signature = next;
      epoch++;
      const scopes = validScopes();
      publish({
        busy: false,
        ready: false,
        errors: [],
        rows: state.rows.filter((r) => scopes.has(r.scope)),
        workspaces: state.workspaces.filter((r) => scopes.has(r.scope)),
      });
    },
    refresh(): Promise<void> {
      if (pending) return runningEpoch === epoch ? pending : pending.then(() => this.refresh());
      runningEpoch = epoch;
      const version = epoch;
      const captured = sources.filter((r) => r.hasSession && r.sessionUserId);
      publish({ ...state, busy: true, errors: [] });
      pending = (async () => {
        for (const source of captured) {
          if (version !== epoch) return;
          const scope = cloudViewScope(source);
          try {
            const rows = await collect(source, version);
            if (version !== epoch || !rows) return;
            publish({
              ...state,
              rows: [...state.rows.filter((r) => r.scope !== scope), ...rows.rows],
              workspaces: [
                ...state.workspaces.filter((r) => r.scope !== scope),
                ...rows.workspaces,
              ],
            });
          } catch (error) {
            if (version !== epoch) return;
            const code = cloudError(error);
            const keep = canRetainCloudCache(error);
            publish({
              ...state,
              rows: keep ? state.rows : state.rows.filter((r) => r.scope !== scope),
              workspaces: keep
                ? state.workspaces
                : state.workspaces.filter((r) => r.scope !== scope),
              errors: [...state.errors, code],
            });
          }
        }
      })().finally(() => {
        pending = undefined;
        if (version === epoch) publish({ ...state, ready: true, busy: false });
      });
      return pending;
    },
  };
}
