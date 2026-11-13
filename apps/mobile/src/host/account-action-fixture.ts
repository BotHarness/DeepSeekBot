import { createConnectAccount } from './connect-account';
import { removeAccountConnections } from './account-connections';
import type { AccountOwner } from './account-owner';
import { parseSavedHosts, type SavedHost, type SavedHosts } from './hosts';

export type AccountFixtureScenario =
  | 'connection-diagnostics'
  | 'connection-diagnostics-network'
  | 'connection-diagnostics-session'
  | 'connection-diagnostics-invalid'
  | 'connection-diagnostics-list'
  | 'success'
  | 'delete-partial'
  | 'local-write'
  | 'session-write'
  | 'expired-retry'
  | 'completion-write'
  | 'linked-computers'
  | 'linked-computers-refresh-failure'
  | 'environments';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export function createAccountActionFixture(scenario: AccountFixtureScenario = 'success') {
  const diagnostics = scenario.startsWith('connection-diagnostics');
  const linked = scenario === 'linked-computers' || scenario === 'linked-computers-refresh-failure';
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
  const unlinked = new Set<string>();
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
      unlinked: [...unlinked],
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
          if (scenario === 'connection-diagnostics-session' && counters.refreshes > 1)
            return response({}, 502);
          return response({ access_token: 'fixture-access', user: { id: owner.subject } });
        }
        if (
          scenario === 'linked-computers-refresh-failure' &&
          url === `${owner.relay}/v1/hosts` &&
          unlinked.size > 0 &&
          !failed
        ) {
          failed = true;
          return response({}, 502);
        }
        if (diagnostics && url.endsWith('/offer')) {
          if (scenario === 'connection-diagnostics-network')
            throw new Error(
              'DNS lookup failed https://private.fixture.invalid?token=fixture-secret Authorization Bearer fixture-secret',
            );
          if (scenario === 'connection-diagnostics-invalid')
            return response({ invalid: 'fixture-secret' });
          return response(
            {
              error: {
                code: 'upstream-unavailable',
                message: 'Authorization Bearer fixture-secret',
              },
            },
            502,
          );
        }
        if (diagnostics && url === `${owner.relay}/v1/hosts`) {
          if (scenario === 'connection-diagnostics-list' && counters.refreshes > 1)
            return response({}, 503);
          return response({
            hosts: [
              {
                id: 'hstudio',
                name: 'Studio Mac',
                hostname: 'studio.fixture.invalid',
                tunnel: true,
              },
              {
                id: 'hlaptop',
                name: 'Travel Laptop',
                hostname: 'laptop.fixture.invalid',
                tunnel: true,
              },
            ],
          });
        }
        if (url === `${owner.relay}/v1/hosts`)
          return response({
            hosts: linked
              ? [
                  {
                    id: 'hoffline',
                    name: 'Offline laptop',
                    hostname: 'offline.fixture.invalid',
                    tunnel: false,
                    sessionKnown: true,
                  },
                  {
                    id: 'hlegacy',
                    name: 'Older computer',
                    hostname: 'legacy.fixture.invalid',
                    tunnel: false,
                    sessionKnown: false,
                  },
                ].filter((host) => !unlinked.has(host.id))
              : scenario === 'environments'
                ? [
                    {
                      id: 'studio',
                      name: 'Studio Mac',
                      hostname: 'studio.fixture.invalid',
                      tunnel: true,
                    },
                    {
                      id: 'laptop',
                      name: 'Travel Laptop',
                      hostname: 'laptop.fixture.invalid',
                      tunnel: true,
                    },
                    {
                      id: 'owned',
                      name: 'Home PC',
                      hostname: 'owned.fixture.invalid',
                      tunnel: true,
                    },
                    {
                      id: 'office',
                      name: 'Office Server',
                      hostname: 'office.fixture.invalid',
                      tunnel: false,
                    },
                  ]
                : [],
          });
        if (linked && init?.method === 'POST' && url.endsWith('/revoke')) {
          const id = new URL(url).pathname.split('/')[3]!;
          if (!['hoffline', 'hlegacy'].includes(id) || unlinked.has(id))
            return response({ error: { code: 'host-not-found' } }, 404);
          unlinked.add(id);
          publish();
          return response({
            deleted: true,
            sessionKnown: id !== 'hlegacy',
            sessionRevoked: id !== 'hlegacy',
          });
        }
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
