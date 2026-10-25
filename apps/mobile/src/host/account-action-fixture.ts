import { createConnectAccount } from './connect-account';
import { removeAccountConnections } from './account-connections';
import type { AccountOwner } from './account-owner';
import { parseSavedHosts, type SavedHost, type SavedHosts } from './hosts';

export type AccountFixtureScenario =
  | 'success'
  | 'delete-partial'
  | 'local-write'
  | 'session-write'
  | 'expired-retry'
  | 'completion-write';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createAccountActionFixture(scenario: AccountFixtureScenario = 'success') {
  const owner: AccountOwner = {
    issuer: 'https://api.workos.com',
    relay: 'https://fixture.invalid',
    clientId: 'client_fixture',
    subject: 'user_fixture',
  };
  const host = (hostId: string, accountOwner?: AccountOwner): SavedHost => ({
    hostId,
    hostName: hostId,
    routes: [`https://${hostId}.fixture.invalid`],
    deviceId: 'fixture-device',
    credential: 'fixture-only',
    ...(accountOwner ? { accountOwner } : {}),
  });
  let state: SavedHosts = {
    hosts: [
      host('owned', owner),
      host('manual'),
      host('legacy'),
      host('other', { ...owner, subject: 'user_other' }),
    ],
    current: 'owned',
  };
  let persisted = JSON.stringify(state);
  let session: string | null = JSON.stringify({
    clientId: owner.clientId,
    subject: owner.subject,
    sessionId: 'fixture-session',
    refreshToken: 'fixture-refresh',
    email: 'fixture@example.invalid',
  });
  let failed = false;
  let remoteDeleted = false;
  let sequence = 0;
  const counters = {
    accountWrites: 0,
    pairingWrites: 0,
    deletes: 0,
    refreshes: 0,
    disconnects: 0,
    cleared: [] as string[],
  };
  const listeners = new Set<() => void>();
  let snapshot = '';
  const publish = () => {
    snapshot = JSON.stringify({
      ...counters,
      signedIn: session !== null,
      saved: state.hosts.map((host) => host.hostId),
      current: state.current ?? null,
      pending: state.pendingAccountRemoval?.map((host) => host.hostId) ?? [],
      remoteDeleted,
    });
    for (const listener of listeners) listener();
  };
  const account = createConnectAccount({
    relay: owner.relay,
    redirectUri: 'fixture:/callback',
    runtime: {
      read: async () => session,
      write: async (value) => {
        counters.accountWrites++;
        if (
          scenario === 'completion-write' &&
          value &&
          JSON.parse(value).action === 'delete-complete' &&
          !failed
        ) {
          failed = true;
          publish();
          throw new Error('fixture completion write');
        }
        if (scenario === 'session-write' && value === null && !failed) {
          failed = true;
          publish();
          throw new Error('fixture write');
        }
        session = value;
        publish();
      },
      random: () => `fixture-${++sequence}`,
      challenge: async (value) => value,
      authorize: async () => null,
      now: () => 0,
      request: async (url, init) => {
        if (url === 'https://api.workos.com/user_management/authenticate') {
          counters.refreshes++;
          publish();
          if ((scenario === 'expired-retry' || scenario === 'completion-write') && failed)
            return response({}, 400);
          return response({ access_token: 'fixture-access', user: { id: owner.subject } });
        }
        if (url === `${owner.relay}/v1/hosts`) return response({ hosts: [] });
        if (url === `${owner.relay}/v1/account` && init?.method === 'DELETE') {
          counters.deletes++;
          remoteDeleted = true;
          if ((scenario === 'delete-partial' || scenario === 'expired-retry') && !failed) {
            failed = true;
            publish();
            return response({}, 502);
          }
          publish();
          return response({ deleted: true });
        }
        throw new Error('fixture rejects every other request');
      },
    },
    removeConnections: (accountOwner) =>
      removeAccountConnections({
        owner: accountOwner,
        state: parseSavedHosts(persisted),
        persist: async (next) => {
          counters.pairingWrites++;
          if (scenario === 'local-write' && !failed) {
            failed = true;
            publish();
            throw new Error('fixture pairing write');
          }
          persisted = JSON.stringify(next);
          publish();
        },
        adopt: (next) => {
          if (state.current === 'owned' && next.current !== 'owned') counters.disconnects++;
          state = next;
          publish();
        },
        clearLocal: async (host) => {
          counters.cleared.push(host.hostId);
          publish();
        },
      }),
  });
  publish();
  return {
    account,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
    saved: () => state.hosts,
  };
}
