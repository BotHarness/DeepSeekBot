import type { HostCall } from '@botharness/host-client/host-answer';
import {
  changeMessagingIdentity,
  changeSenderAccess,
  readMessagingApps,
  readMessagingSnapshot,
  reviewPairingRequest,
  type MessagingApps,
} from '@botharness/host-client/messaging';
import type {
  MessagingApp,
  MessagingSnapshot,
} from '../../../../packages/core/src/messaging/outbound-types';
import type {
  PairingRequest,
  PairingReviewInput,
} from '../../../../packages/core/src/messaging/pairing';
import type { ExternalUserRole } from '../../../../packages/core/src/messaging/permissions/index.js';

export type { MessagingApp, MessagingSnapshot, PairingRequest, ExternalUserRole };

export type Loaded<T> =
  | { status: 'loading' }
  | { status: 'failed'; error: unknown }
  | { status: 'ready'; value: T; checking: boolean; error?: unknown };

type ReadMode = 'saved' | 'status';

export interface Resource<T> {
  get(): Loaded<T>;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  patch(change: (value: T) => T): void;
}

function resource<T extends { checks?: 'pending' | 'complete' }>(
  read: (mode: ReadMode) => Promise<T>,
): Resource<T> {
  let state: Loaded<T> = { status: 'loading' };
  const listeners = new Set<() => void>();
  let sequence = 0;
  let running: Promise<void> | undefined;
  let again = false;
  const publish = (next: Loaded<T>) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const once = async (): Promise<void> => {
    const mine = ++sequence;
    if (state.status === 'ready' && !state.checking) publish({ ...state, checking: true });
    try {
      const saved = await read('saved');
      if (mine !== sequence) return;
      const pending = saved.checks === 'pending';
      publish({ status: 'ready', value: saved, checking: pending });
      if (!pending) return;
      const live = await read('status');
      if (mine !== sequence) return;
      publish({ status: 'ready', value: live, checking: false });
    } catch (error) {
      if (mine !== sequence) return;
      publish(
        state.status === 'ready'
          ? { status: 'ready', value: state.value, checking: false, error }
          : { status: 'failed', error },
      );
    }
  };
  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        do {
          again = false;
          await once();
        } while (again);
      })().finally(() => {
        running = undefined;
      });
      return running;
    },
    patch(change) {
      if (state.status !== 'ready') return;
      sequence += 1;
      publish({ ...state, value: change(state.value) });
    },
  };
}

interface Owner {
  apps: Resource<MessagingApps>;
  bots: Map<string, Resource<MessagingSnapshot>>;
}

const owners = new WeakMap<HostCall, Owner>();

function owner(host: HostCall): Owner {
  let found = owners.get(host);
  if (found === undefined) {
    found = {
      apps: resource(async () => ({ ...(await readMessagingApps(host)), checks: 'complete' })),
      bots: new Map(),
    };
    owners.set(host, found);
  }
  return found;
}

export function messagingApps(host: HostCall): Resource<MessagingApps> {
  return owner(host).apps;
}

export function externalContacts(host: HostCall, slug: string): Resource<MessagingSnapshot> {
  const { bots } = owner(host);
  let found = bots.get(slug);
  if (found === undefined) {
    found = resource((mode) => readMessagingSnapshot(host, slug, mode));
    bots.set(slug, found);
  }
  return found;
}

function refreshBot(host: HostCall, slug: string | undefined): void {
  if (slug === undefined) return;
  const found = owner(host).bots.get(slug);
  if (found !== undefined && found.get().status !== 'loading') void found.load();
}

function sameApp(a: MessagingApp, b: MessagingApp): boolean {
  return a.providerId === b.providerId && a.ref === b.ref;
}

function placeApp(host: HostCall, app: MessagingApp, bound: Partial<MessagingApp>): void {
  messagingApps(host).patch((value) => ({
    ...value,
    apps: value.apps.map((item) => {
      if (!sameApp(item, app)) return item;
      const { boundBotSlug: _slug, bindingId: _binding, ...rest } = item;
      return { ...rest, ...bound } as MessagingApp;
    }),
  }));
}

async function identityRevision(host: HostCall, app: MessagingApp): Promise<number> {
  const slug = app.boundBotSlug;
  if (slug === undefined || app.bindingId === undefined) throw new Error('not-bound');
  const cached = externalContacts(host, slug).get();
  const snapshot =
    cached.status === 'ready' ? cached.value : await readMessagingSnapshot(host, slug, 'saved');
  const identity = snapshot.identities?.find((item) => item.id === app.bindingId);
  if (identity === undefined) throw new Error('binding-missing');
  return identity.revision;
}

export async function unbindApp(host: HostCall, app: MessagingApp): Promise<void> {
  const slug = app.boundBotSlug;
  const id = app.bindingId;
  if (slug === undefined || id === undefined) throw new Error('not-bound');
  const expectedRevision = await identityRevision(host, app);
  await changeMessagingIdentity(host, slug, { kind: 'unbind', id, expectedRevision });
  placeApp(host, app, {});
  externalContacts(host, slug).patch((value) =>
    value.identities === undefined
      ? value
      : { ...value, identities: value.identities.filter((item) => item.id !== id) },
  );
  refreshBot(host, slug);
  void messagingApps(host).load();
}

export async function bindApp(host: HostCall, app: MessagingApp, slug: string): Promise<void> {
  if (app.boundBotSlug === slug) return;
  if (app.boundBotSlug !== undefined) await unbindApp(host, app);
  const identity = await changeMessagingIdentity(host, slug, {
    kind: 'bind',
    providerId: app.providerId,
    accountRef: app.ref,
    fingerprint: app.fingerprint,
  });
  placeApp(host, app, { boundBotSlug: slug, bindingId: identity.id });
  refreshBot(host, slug);
  void messagingApps(host).load();
}

function placePairing(host: HostCall, slug: string, pairing: PairingRequest): void {
  externalContacts(host, slug).patch((value) => ({
    ...value,
    pairings: (value.pairings ?? []).map((item) => (item.id === pairing.id ? pairing : item)),
  }));
}

export async function reviewPairing(
  host: HostCall,
  slug: string,
  input: PairingReviewInput,
): Promise<PairingRequest> {
  try {
    const pairing = await reviewPairingRequest(host, slug, input);
    placePairing(host, slug, pairing);
    return pairing;
  } finally {
    void externalContacts(host, slug).load();
  }
}

export async function changeRole(
  host: HostCall,
  slug: string,
  pairing: PairingRequest,
  role: ExternalUserRole,
): Promise<void> {
  try {
    await changeSenderAccess(host, slug, {
      kind: 'reassign-role',
      id: pairing.id,
      expectedRevision: pairing.revision,
      roleId: role.id,
      expectedRoleRevision: role.revision,
    });
    placePairing(host, slug, { ...pairing, roleId: role.id, roleRevision: role.revision });
  } finally {
    void externalContacts(host, slug).load();
  }
}

export function contactCounts(snapshot: MessagingSnapshot | undefined): {
  pending: number;
  approved: number;
} {
  const pairings = snapshot?.pairings ?? [];
  return {
    pending: pairings.filter((item) => item.status === 'pending').length,
    approved: pairings.filter((item) => item.status === 'approved').length,
  };
}
