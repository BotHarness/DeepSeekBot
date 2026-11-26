import { describe, expect, it, vi } from 'vitest';

import type { HostCall } from '@botharness/host-client/host-answer';
import {
  bindApp,
  changeRole,
  contactCounts,
  externalContacts,
  messagingApps,
  reviewPairing,
  unbindApp,
  type MessagingApp,
} from '../src/host/messaging-settings';

const PAIRING_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '22222222-2222-4222-8222-222222222222';
const BINDING_ID = '33333333-3333-4333-8333-333333333333';

const app: MessagingApp = {
  providerId: 'dsh-im/qq',
  ref: 'synthetic-4242',
  platform: 'qq',
  name: 'Reception QA app',
  fingerprint: 'a'.repeat(64),
  connected: true,
};

function pairing(overrides: Record<string, unknown> = {}) {
  return {
    id: PAIRING_ID,
    reference: 'ABCD',
    botSlug: 'scout',
    bindingId: BINDING_ID,
    accountName: 'Reception QA app',
    actorId: 'synthetic-human',
    actorName: 'Ada',
    conversationId: 'dm-1',
    conversationKind: 'dm',
    status: 'pending',
    capabilities: [],
    createdAt: '2026-11-26T08:00:00.000Z',
    expiresAt: '2026-11-27T08:00:00.000Z',
    revision: 1,
    attempts: 1,
    purpose: 'conversation',
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    checks: 'complete',
    accounts: [],
    grants: [],
    intents: [],
    identities: [{ id: BINDING_ID, revision: 4, name: 'Reception QA app', enabled: true }],
    pairings: [pairing()],
    roles: [
      {
        id: ROLE_ID,
        botSlug: 'scout',
        name: 'Friend',
        behavior: 'Chat',
        capabilities: [],
        revision: 2,
      },
    ],
    ...overrides,
  };
}

function fakeHost(handlers: Record<string, (args: Record<string, unknown>) => unknown>) {
  const calls: [string, Record<string, unknown>][] = [];
  const host: HostCall = {
    call: vi.fn(async (method: string, args: Record<string, unknown> = {}) => {
      calls.push([method, args]);
      const handler = handlers[method];
      if (handler === undefined) throw new Error(`unexpected ${method}`);
      return handler(args);
    }),
  };
  return { host, calls };
}

describe('external contacts', () => {
  it('shows saved settings first, then the live status when checks are pending', async () => {
    let release!: () => void;
    const live = new Promise<void>((done) => (release = done));
    const { host, calls } = fakeHost({
      messagingSnapshot: async (args) =>
        args['mode'] === 'saved'
          ? snapshot({ checks: 'pending' })
          : (await live, snapshot({ checks: 'complete', pairings: [] })),
    });
    const contacts = externalContacts(host, 'scout');
    const loading = contacts.load();
    await vi.waitFor(() => expect(contacts.get().status).toBe('ready'));
    const saved = contacts.get();
    expect(saved.status === 'ready' && saved.checking).toBe(true);
    expect(contactCounts(saved.status === 'ready' ? saved.value : undefined).pending).toBe(1);
    release();
    await loading;
    const done = contacts.get();
    expect(done.status === 'ready' && done.checking).toBe(false);
    expect(calls.map(([, args]) => args['mode'])).toEqual(['saved', 'status']);
  });

  it('shares one read between screens and reruns once for changes made during it', async () => {
    let reads = 0;
    const { host } = fakeHost({
      messagingSnapshot: async () => {
        reads += 1;
        await new Promise((done) => setTimeout(done, 5));
        return snapshot();
      },
    });
    const contacts = externalContacts(host, 'scout');
    await Promise.all([contacts.load(), contacts.load(), contacts.load()]);
    expect(reads).toBe(2);
    await contacts.load();
    expect(reads).toBe(3);
  });

  it('places the reviewed pairing at once and drops a read that started before the review', async () => {
    let onHost = pairing();
    let gate: Promise<void> = Promise.resolve();
    const { host } = fakeHost({
      messagingSnapshot: async () => {
        const seen = onHost;
        await gate;
        return snapshot({ pairings: [seen] });
      },
      pairingReview: () => {
        onHost = pairing({ status: 'approved', roleId: ROLE_ID, revision: 2 });
        return { pairing: onHost };
      },
    });
    const contacts = externalContacts(host, 'scout');
    await contacts.load();
    let open!: () => void;
    gate = new Promise((done) => (open = done));
    const stale = contacts.load();
    await reviewPairing(host, 'scout', {
      kind: 'approve',
      id: PAIRING_ID,
      expectedRevision: 1,
      roleId: ROLE_ID,
      expectedRoleRevision: 2,
    });
    const placed = contacts.get();
    expect(placed.status === 'ready' && placed.value.pairings?.[0]?.status).toBe('approved');
    gate = Promise.resolve();
    open();
    await stale;
    const settled = contacts.get();
    expect(settled.status === 'ready' && settled.value.pairings?.[0]?.status).toBe('approved');
  });

  it('sends a role change with both revisions and patches the role', async () => {
    const { host, calls } = fakeHost({
      messagingSnapshot: () =>
        snapshot({ pairings: [pairing({ status: 'approved', revision: 3 })] }),
      senderAccess: () => ({}),
    });
    const contacts = externalContacts(host, 'scout');
    await contacts.load();
    const state = contacts.get();
    if (state.status !== 'ready') throw new Error('not ready');
    await changeRole(host, 'scout', state.value.pairings![0]!, state.value.roles![0]!);
    expect(calls.find(([method]) => method === 'senderAccess')?.[1]).toEqual({
      slug: 'scout',
      input: {
        kind: 'reassign-role',
        id: PAIRING_ID,
        expectedRevision: 3,
        roleId: ROLE_ID,
        expectedRoleRevision: 2,
      },
    });
  });

  it('keeps the last good settings when a refresh fails', async () => {
    let fail = false;
    const { host } = fakeHost({
      messagingSnapshot: () => {
        if (fail) throw new Error('offline');
        return snapshot();
      },
    });
    const contacts = externalContacts(host, 'scout');
    await contacts.load();
    fail = true;
    await contacts.load();
    const state = contacts.get();
    expect(state.status).toBe('ready');
    expect(state.status === 'ready' && state.error).toBeInstanceOf(Error);
  });
});

describe('IM apps', () => {
  it('binds an app to a Bot and shows the binding before the list reloads', async () => {
    const { host, calls } = fakeHost({
      messagingApps: () => ({ apps: [app], setups: [] }),
      messagingIdentity: () => ({ identity: { id: BINDING_ID, revision: 1, enabled: true } }),
    });
    const apps = messagingApps(host);
    await apps.load();
    await bindApp(host, app, 'scout');
    const state = apps.get();
    expect(state.status === 'ready' && state.value.apps[0]?.boundBotSlug).toBe('scout');
    expect(calls.find(([method]) => method === 'messagingIdentity')?.[1]).toEqual({
      slug: 'scout',
      input: {
        kind: 'bind',
        providerId: app.providerId,
        accountRef: app.ref,
        fingerprint: app.fingerprint,
      },
    });
  });

  it('moves an app by unbinding with the current revision, then binding', async () => {
    const bound = { ...app, boundBotSlug: 'scout', bindingId: BINDING_ID };
    const { host, calls } = fakeHost({
      messagingApps: () => ({ apps: [bound], setups: [] }),
      messagingSnapshot: () => snapshot(),
      messagingIdentity: (args) =>
        (args['input'] as { kind: string }).kind === 'unbind'
          ? { identity: { id: BINDING_ID, revision: 5, enabled: false } }
          : { identity: { id: 'new-binding', revision: 1, enabled: true } },
    });
    await messagingApps(host).load();
    await bindApp(host, bound, 'pilot');
    const inputs = calls
      .filter(([method]) => method === 'messagingIdentity')
      .map(([, args]) => args);
    expect(inputs).toEqual([
      { slug: 'scout', input: { kind: 'unbind', id: BINDING_ID, expectedRevision: 4 } },
      {
        slug: 'pilot',
        input: {
          kind: 'bind',
          providerId: app.providerId,
          accountRef: app.ref,
          fingerprint: app.fingerprint,
        },
      },
    ]);
    const state = messagingApps(host).get();
    expect(state.status === 'ready' && state.value.apps[0]?.boundBotSlug).toBe('pilot');
  });

  it('refuses to unbind an app that is not bound', async () => {
    const { host } = fakeHost({});
    await expect(unbindApp(host, app)).rejects.toThrow('not-bound');
  });
});
