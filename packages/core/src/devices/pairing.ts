import { OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const PAIRING_OFFER_TTL_MS = 10 * 60 * 1000;
const LAST_SEEN_RESOLUTION_MS = 60 * 1000;
const MAX_OPEN_OFFERS = 16;
const MAX_SETTLED_OFFERS = 64;
const DEVICE_NAME_MAX = 60;

export interface HostIdentity {
  id: string;
  name: string;
}

export interface PairedDevice {
  id: string;
  name: string;
  enrollment?: 'owner-password';
  humanId?: string;
  publicKey?: string;
  pairedAt: string;
  lastSeenAt?: string;
  feedReadAt?: string;
  revokedAt?: string;
}

export interface PairingOffer {
  offer: string;
  expiresAt: string;
  receipt: string;
}

export type OfferStatus =
  | {
      receipt: string;
      state: 'pending';
      expiresAt: string;
      publicKey?: string;
      name?: string;
      approved?: boolean;
    }
  | { receipt: string; state: 'redeemed'; deviceId: string; settledAt: string }
  | { receipt: string; state: 'expired' | 'refused' | 'superseded'; settledAt: string }
  | { receipt: string; state: 'unknown' };

type SettledOfferStatus = Exclude<OfferStatus, { state: 'pending' | 'unknown' }>;

export type OfferRefusal =
  | 'offer-invalid'
  | 'offer-expired'
  | 'device-approval-required'
  | 'relationship-inactive';
export type KeyWatchEvent = { state: 'approved' } | Exclude<OfferStatus, { state: 'pending' }>;
export type DeviceRefusal =
  | 'device-credential-missing'
  | 'device-unknown'
  | 'device-revoked'
  | 'sign-in-required'
  | 'member-suspended';

export type Redemption =
  | {
      ok: true;
      device: PairedDevice;
      credential: string;
      host: HostIdentity;
      humanId?: string;
      displayName?: string;
      mustChangePassword?: boolean;
    }
  | { ok: false; code: OfferRefusal };

type SuccessfulRedemption = Extract<Redemption, { ok: true }>;

export type Admission = { ok: true; device: PairedDevice } | { ok: false; code: DeviceRefusal };

export type DevicePairingEvent =
  | { phase: 'offer-created' | 'offer-expired' | 'offer-refused' }
  | { phase: 'offer-redeemed' | 'device-admitted'; deviceId: string }
  | { phase: 'owner-password-enrolled'; deviceId: string }
  | { phase: 'device-refused'; code: DeviceRefusal; deviceId?: string }
  | { phase: 'device-revoked'; deviceId: string; closedStreams: number };

export interface PendingDeviceKey {
  receipt: string;
  state: 'pending';
  expiresAt: string;
  publicKey: string;
  name: string;
  approved: boolean;
}

export interface DevicePairing {
  host(): HostIdentity;
  createOffer(binding?: {
    verifierHash?: string;
    name?: string;
    humanId?: string;
    relationshipId?: string;
  }): PairingOffer;
  offerStatus(receipt: string): OfferStatus;
  claimRelationshipOffer(offer: string): boolean;
  clearOffers(): void;
  stopOfferExpiry(): void;
  redeem(input: {
    offer: string;
    name?: string;
    verifier?: string;
    publicKey?: string;
    allowReconnect?: boolean;
  }): Redemption;
  resumeKeyRedemption(input: {
    offer: string;
    publicKey: string;
    verifier?: string;
  }): SuccessfulRedemption | undefined;
  issueOwnerPasswordDevice(input: {
    humanId: string;
    name: string;
    publicKey: string;
  }): { deviceId: string; credential: string } | undefined;
  requestKey(input: {
    offer: string;
    publicKey: string;
    name?: string;
    verifier?: string;
  }): { ok: true; receipt: string } | { ok: false; code: OfferRefusal };
  pendingKeys(): PendingDeviceKey[];
  approveKey(receipt: string, publicKey: string): boolean;
  watchKey(
    receipt: string,
    publicKey: string,
    listener: (event: KeyWatchEvent) => void,
  ): () => void;
  cancelRelationshipOffers(relationshipId: string, publicKey: string): number;
  admitKey(authorization: string | undefined, publicKey: string): Admission;
  admit(authorization: string | undefined, noisePublicKey?: string): Admission;
  check(deviceId: string): Admission;
  acknowledgeFeed(deviceId: string): Admission;
  list(): PairedDevice[];
  revoke(deviceId: string): { revoked: boolean; closedStreams: number };
  closeStreams(): number;
  attachStream(deviceId: string, close: () => void): () => void;
}

export interface DevicePairingOptions {
  database: OperationalDatabaseModulePort;
  hostName: string;
  ownerHumanId?: () => string;
  now?: () => number;
  record?: (event: DevicePairingEvent) => void;
  onRevoked?: (deviceId: string) => void;
  onChange?: () => void;
  onPaired?: (device: PairedDevice) => void;
  members?: {
    redeem(
      humanId: string,
      name: string,
      publicKey?: string,
    ): {
      deviceId: string;
      credential: string;
      humanId: string;
      displayName: string;
      mustChangePassword: boolean;
    };
    admit(authorization: string | undefined, publicKey?: string): PairedDevice | undefined;
    refusal(authorization: string | undefined): 'sign-in-required' | 'member-suspended';
    check(deviceId: string): PairedDevice | undefined;
    attach(deviceId: string, close: () => void): () => void;
  };
}

interface Row {
  human_id: string;
  device_id: string;
  name: string;
  secret_hash: string;
  public_key: string | null;
  enrollment?: 'owner-password' | null;
  paired_at: string;
  last_seen_at: string | null;
  feed_read_at: string | null;
  revoked_at: string | null;
}

const CREDENTIAL = /^Device ([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{32,128})$/u;

const token = (bytes: number): string => randomBytes(bytes).toString('base64url');
const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

function device(row: Row): PairedDevice {
  return {
    id: row.device_id,
    name: row.name,
    pairedAt: row.paired_at,
    ...(row.enrollment === 'owner-password' ? { enrollment: row.enrollment } : {}),
    ...(row.public_key === null ? {} : { publicKey: row.public_key }),
    ...(row.last_seen_at === null ? {} : { lastSeenAt: row.last_seen_at }),
    ...(row.feed_read_at == null ? {} : { feedReadAt: row.feed_read_at }),
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}

function deviceName(input: string | undefined): string {
  const name = (input ?? '')
    .replace(/[\u0000-\u001f\u007f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return name === '' ? 'Phone' : [...name].slice(0, DEVICE_NAME_MAX).join('');
}

export function createDevicePairing(options: DevicePairingOptions): DevicePairing {
  const { database } = options;
  const ownerHumanId = options.ownerHumanId ?? (() => OWNER_HUMAN_CONTEXT.humanId);
  const now = options.now ?? Date.now;
  const record = options.record ?? (() => {});
  const changed = options.onChange ?? (() => {});
  const iso = (ms: number): string => new Date(ms).toISOString();

  const offers = new Map<
    string,
    {
      expiresAt: number;
      humanId: string;
      receipt: string;
      memberHumanId?: string;
      verifierHash?: string;
      name?: string;
      publicKey?: string;
      approved?: boolean;
      relationshipId?: string;
    }
  >();
  const settled = new Map<string, SettledOfferStatus>();
  const keyWatches = new Map<
    string,
    { listeners: Set<(event: KeyWatchEvent) => void>; timer?: ReturnType<typeof setTimeout> }
  >();
  const unconfirmedKeyRedemptions = new Map<
    string,
    { expiresAt: number; publicKey: string; verifierHash?: string; result: SuccessfulRedemption }
  >();
  const forgetRedemption = (deviceId: string): void => {
    for (const [key, entry] of unconfirmedKeyRedemptions)
      if (entry.result.device.id === deviceId) unconfirmedKeyRedemptions.delete(key);
    if (unconfirmedKeyRedemptions.size === 0 && options.onChange === undefined) stopOfferExpiry();
  };
  const streams = new Map<string, Set<() => void>>();
  let expiry: ReturnType<typeof setTimeout> | undefined;

  const stopOfferExpiry = (): void => {
    clearTimeout(expiry);
    expiry = undefined;
  };
  const scheduleOfferExpiry = (): void => {
    if (expiry !== undefined) return;
    const next = Math.min(
      ...(options.onChange === undefined
        ? []
        : Array.from(offers.values(), (offer) => offer.expiresAt)),
      ...Array.from(unconfirmedKeyRedemptions.values(), (entry) => entry.expiresAt),
    );
    if (!Number.isFinite(next)) return;
    expiry = setTimeout(
      () => {
        expiry = undefined;
        sweep();
        scheduleOfferExpiry();
      },
      Math.max(1, next - now()),
    );
    expiry.unref();
  };

  const settle = (
    receipt: string,
    outcome:
      | { state: 'expired' | 'refused' | 'superseded' }
      | { state: 'redeemed'; deviceId: string },
  ): void => {
    settled.delete(receipt);
    while (settled.size >= MAX_SETTLED_OFFERS) settled.delete(settled.keys().next().value!);
    const status = { receipt, ...outcome, settledAt: iso(now()) };
    settled.set(receipt, status);
    const watch = keyWatches.get(receipt);
    if (watch) {
      keyWatches.delete(receipt);
      clearTimeout(watch.timer);
      const listeners = [...watch.listeners];
      watch.listeners.clear();
      for (const listener of listeners) listener(status);
    }
  };

  const sweep = (): void => {
    const instant = now();
    for (const [key, entry] of unconfirmedKeyRedemptions)
      if (entry.expiresAt <= instant) unconfirmedKeyRedemptions.delete(key);
    let swept = false;
    for (const [key, { expiresAt, receipt }] of offers)
      if (expiresAt <= instant) {
        offers.delete(key);
        settle(receipt, { state: 'expired' });
        record({ phase: 'offer-expired' });
        swept = true;
      }
    if (swept) changed();
  };

  const row = (deviceId: string) => {
    const current = database.read(
      (connection) =>
        connection
          .prepare(`SELECT device.*, EXISTS (
          SELECT 1 FROM relationship_device_grants AS grant_ref
          JOIN host_relationships AS relationship ON relationship.relationship_id = grant_ref.relationship_id
          WHERE grant_ref.device_id = device.device_id AND relationship.state != 'active'
        ) AS relationship_inactive FROM paired_devices AS device WHERE device.device_id = ?`)
          .get(deviceId) as Row | undefined,
    );
    if (current === undefined) return undefined;
    if (!('relationship_inactive' in current) || typeof current.relationship_inactive !== 'number')
      throw new Error('device-admission-state-invalid');
    return { ...current, relationshipInactive: current.relationship_inactive !== 0 };
  };

  const active = (current: NonNullable<ReturnType<typeof row>>): Admission => {
    if (
      current.revoked_at !== null ||
      current.human_id !== ownerHumanId() ||
      current.relationshipInactive
    ) {
      record({ phase: 'device-refused', code: 'device-revoked', deviceId: current.device_id });
      return { ok: false, code: 'device-revoked' };
    }
    const seen = now();
    const last = current.last_seen_at === null ? 0 : Date.parse(current.last_seen_at);
    if (seen - last >= LAST_SEEN_RESOLUTION_MS) {
      current.last_seen_at = iso(seen);
      database.transaction(
        (connection) =>
          connection
            .prepare(
              'UPDATE paired_devices SET last_seen_at = ? WHERE device_id = ? AND revoked_at IS NULL',
            )
            .run(current.last_seen_at, current.device_id),
        ['paired-devices'],
      );
      record({ phase: 'device-admitted', deviceId: current.device_id });
    }
    return { ok: true, device: device(current) };
  };

  const host = (): HostIdentity => {
    const existing = database.read(
      (connection) =>
        connection.prepare('SELECT host_id FROM device_pairing_host WHERE singleton = 1').get() as
          | { host_id: string }
          | undefined,
    );
    const id =
      existing?.host_id ??
      database.transaction((connection) => {
        const fresh = token(12);
        connection
          .prepare(
            'INSERT OR IGNORE INTO device_pairing_host (singleton, host_id, created_at) VALUES (1, ?, ?)',
          )
          .run(fresh, iso(now()));
        return (
          connection
            .prepare('SELECT host_id FROM device_pairing_host WHERE singleton = 1')
            .get() as {
            host_id: string;
          }
        ).host_id;
      });
    return { id, name: options.hostName };
  };

  return {
    host,
    stopOfferExpiry,

    createOffer(binding) {
      sweep();
      let displacedKey = false;
      while (offers.size >= MAX_OPEN_OFFERS) {
        const oldest = offers.keys().next().value!;
        const displaced = offers.get(oldest)!;
        displacedKey ||= displaced.publicKey !== undefined;
        offers.delete(oldest);
        settle(displaced.receipt, { state: 'superseded' });
      }
      const offer = token(24);
      const receipt = token(9);
      const expiresAt = now() + PAIRING_OFFER_TTL_MS;
      offers.set(digest(offer).toString('hex'), {
        expiresAt,
        receipt,
        ...binding,
        humanId: ownerHumanId(),
        ...(binding?.humanId === undefined ? {} : { memberHumanId: binding.humanId }),
      });
      scheduleOfferExpiry();
      if (displacedKey) changed();
      record({ phase: 'offer-created' });
      return { offer, expiresAt: iso(expiresAt), receipt };
    },

    clearOffers() {
      unconfirmedKeyRedemptions.clear();
      stopOfferExpiry();
      if (offers.size === 0) return;
      const pending = [...offers.values()];
      offers.clear();
      for (const open of pending) {
        settle(open.receipt, { state: 'superseded' });
        record({ phase: 'offer-refused' });
      }
      changed();
    },

    offerStatus(receipt) {
      sweep();
      for (const open of offers.values())
        if (open.receipt === receipt)
          return {
            receipt,
            state: 'pending',
            expiresAt: iso(open.expiresAt),
            ...(open.publicKey === undefined
              ? {}
              : {
                  publicKey: open.publicKey,
                  name: open.name ?? 'Phone',
                  approved: open.approved === true,
                }),
          };
      return settled.get(receipt) ?? { receipt, state: 'unknown' };
    },

    claimRelationshipOffer(offer) {
      sweep();
      const key = digest(offer).toString('hex');
      const open = offers.get(key);
      if (
        !open ||
        open.humanId !== ownerHumanId() ||
        open.memberHumanId !== undefined ||
        open.publicKey !== undefined ||
        open.verifierHash !== undefined
      )
        return false;
      offers.delete(key);
      settle(open.receipt, { state: 'superseded' });
      return true;
    },

    requestKey(input) {
      sweep();
      const open = offers.get(digest(input.offer).toString('hex'));
      if (
        !open ||
        !/^[0-9a-f]{64}$/u.test(input.publicKey) ||
        (open.publicKey !== undefined && open.publicKey !== input.publicKey) ||
        (open.verifierHash !== undefined &&
          (input.verifier === undefined ||
            digest(input.verifier).toString('base64url') !== open.verifierHash))
      )
        return { ok: false, code: 'offer-invalid' };
      if (open.publicKey === undefined) {
        open.publicKey = input.publicKey;
        open.name = deviceName(input.name ?? open.name);
        open.approved = open.memberHumanId !== undefined;
        changed();
      }
      return { ok: true, receipt: open.receipt };
    },

    pendingKeys() {
      sweep();
      return [...offers.values()]
        .filter((open) => open.publicKey !== undefined)
        .map((open) => ({
          receipt: open.receipt,
          state: 'pending' as const,
          expiresAt: iso(open.expiresAt),
          publicKey: open.publicKey!,
          name: open.name ?? 'Phone',
          approved: open.approved === true,
        }));
    },

    approveKey(receipt, publicKey) {
      sweep();
      for (const open of offers.values()) {
        if (
          open.receipt === receipt &&
          open.publicKey === publicKey &&
          /^[0-9a-f]{64}$/u.test(publicKey)
        ) {
          if (open.approved === true) return true;
          open.approved = true;
          const watch = keyWatches.get(receipt);
          if (watch) {
            for (const listener of [...watch.listeners]) {
              if (!watch.listeners.delete(listener)) continue;
              if (watch.listeners.size === 0) {
                keyWatches.delete(receipt);
                clearTimeout(watch.timer);
              }
              listener({ state: 'approved' });
            }
          }
          changed();
          return true;
        }
      }
      return false;
    },

    watchKey(receipt, publicKey, listener) {
      sweep();
      const open = [...offers.values()].find((offer) => offer.receipt === receipt);
      if (!open || open.publicKey !== publicKey) {
        listener(settled.get(receipt) ?? { receipt, state: 'unknown' });
        return () => {};
      }
      if (open.approved) {
        listener({ state: 'approved' });
        return () => {};
      }
      let watch = keyWatches.get(receipt);
      if (!watch) {
        watch = { listeners: new Set() };
        if (options.onChange === undefined) {
          watch.timer = setTimeout(sweep, Math.max(1, open.expiresAt - now()));
          watch.timer.unref();
        }
        keyWatches.set(receipt, watch);
      }
      const notify = (event: KeyWatchEvent) => listener(event);
      watch.listeners.add(notify);
      return () => {
        watch.listeners.delete(notify);
        if (keyWatches.get(receipt) === watch && watch.listeners.size === 0) {
          keyWatches.delete(receipt);
          clearTimeout(watch.timer);
        }
      };
    },
    cancelRelationshipOffers(relationshipId, publicKey) {
      let cancelled = 0;
      for (const [key, open] of offers) {
        if (open.relationshipId !== relationshipId || open.publicKey !== publicKey) continue;
        offers.delete(key);
        settle(open.receipt, { state: 'refused' });
        cancelled++;
      }
      if (cancelled > 0) changed();
      return cancelled;
    },

    admitKey(authorization, publicKey) {
      const admitted = this.admit(authorization, publicKey);
      if (admitted.ok) forgetRedemption(admitted.device.id);
      return admitted;
    },

    resumeKeyRedemption(input) {
      sweep();
      const entry = unconfirmedKeyRedemptions.get(digest(input.offer).toString('hex'));
      if (
        !entry ||
        entry.publicKey !== input.publicKey ||
        (entry.verifierHash !== undefined &&
          (input.verifier === undefined ||
            !timingSafeEqual(digest(input.verifier), Buffer.from(entry.verifierHash, 'base64url'))))
      )
        return undefined;
      const current = row(entry.result.device.id);
      if (!current || !active(current).ok) return undefined;
      return entry.result;
    },

    redeem(input) {
      const key = digest(input.offer).toString('hex');
      const open = offers.get(key);
      if (
        open !== undefined &&
        (open.publicKey !== undefined || input.publicKey !== undefined) &&
        (open.publicKey !== input.publicKey || open.approved !== true)
      )
        return { ok: false, code: 'device-approval-required' };
      if (offers.delete(key)) changed();
      if (
        open === undefined ||
        open.humanId !== ownerHumanId() ||
        (open.verifierHash !== undefined &&
          (input.verifier === undefined ||
            !timingSafeEqual(digest(input.verifier), Buffer.from(open.verifierHash, 'base64url'))))
      ) {
        if (open !== undefined) settle(open.receipt, { state: 'refused' });
        record({ phase: 'offer-refused' });
        return { ok: false, code: 'offer-invalid' };
      }
      if (open.expiresAt <= now()) {
        settle(open.receipt, { state: 'expired' });
        record({ phase: 'offer-expired' });
        return { ok: false, code: 'offer-expired' };
      }
      if (open.memberHumanId !== undefined) {
        const result = options.members?.redeem(
          open.memberHumanId,
          deviceName(input.name ?? open.name),
          input.publicKey,
        );
        if (!result) {
          settle(open.receipt, { state: 'refused' });
          return { ok: false, code: 'offer-invalid' };
        }
        settle(open.receipt, { state: 'redeemed', deviceId: result.deviceId });
        record({ phase: 'offer-redeemed', deviceId: result.deviceId });
        return {
          ok: true,
          ...result,
          device: {
            id: result.deviceId,
            humanId: result.humanId,
            name: deviceName(input.name ?? open.name),
            pairedAt: iso(now()),
          },
          host: host(),
        };
      }
      const id = token(16);
      const secret = token(32);
      const pairedAt = iso(now());
      const name = deviceName(input.name ?? open.name);
      const issued = database.transaction(
        (connection) => {
          if (
            open.relationshipId !== undefined &&
            !connection
              .prepare(
                "SELECT 1 FROM host_relationships WHERE relationship_id = ? AND state = 'active'",
              )
              .get(open.relationshipId)
          )
            return false;
          if (open.relationshipId !== undefined) {
            const enrollment = connection
              .prepare(
                "SELECT state, expires_at FROM relationship_client_enrollments WHERE relationship_id = ? AND public_key = ? AND direction = 'incoming'",
              )
              .get(open.relationshipId, input.publicKey ?? '') as
              | { state: string; expires_at: number }
              | undefined;
            if (!enrollment || enrollment.state !== 'unconfirmed' || enrollment.expires_at <= now())
              return false;
            connection
              .prepare(
                "UPDATE relationship_client_enrollments SET state = 'committed' WHERE relationship_id = ? AND public_key = ? AND direction = 'incoming'",
              )
              .run(open.relationshipId, input.publicKey ?? '');
          }
          connection
            .prepare(
              'INSERT INTO paired_devices (device_id, name, secret_hash, paired_at, public_key, human_id) VALUES (?, ?, ?, ?, ?, ?)',
            )
            .run(
              id,
              name,
              digest(secret).toString('hex'),
              pairedAt,
              input.publicKey ?? null,
              open.humanId,
            );
          if (open.relationshipId !== undefined)
            connection
              .prepare(
                'INSERT INTO relationship_device_grants (device_id, relationship_id) VALUES (?, ?)',
              )
              .run(id, open.relationshipId);
          return true;
        },
        ['paired-devices'],
      );
      if (!issued) {
        settle(open.receipt, { state: 'refused' });
        record({ phase: 'offer-refused' });
        return { ok: false, code: 'relationship-inactive' };
      }
      const result: SuccessfulRedemption = {
        ok: true,
        device: {
          id,
          name,
          pairedAt,
          ...(input.publicKey === undefined ? {} : { publicKey: input.publicKey }),
        },
        credential: `${id}.${secret}`,
        host: host(),
      };
      if (
        input.allowReconnect &&
        input.publicKey !== undefined &&
        open.relationshipId === undefined
      ) {
        while (unconfirmedKeyRedemptions.size >= MAX_SETTLED_OFFERS)
          unconfirmedKeyRedemptions.delete(unconfirmedKeyRedemptions.keys().next().value!);
        unconfirmedKeyRedemptions.set(key, {
          expiresAt: open.expiresAt,
          publicKey: input.publicKey,
          ...(open.verifierHash === undefined ? {} : { verifierHash: open.verifierHash }),
          result,
        });
        scheduleOfferExpiry();
      }
      settle(open.receipt, { state: 'redeemed', deviceId: id });
      record({ phase: 'offer-redeemed', deviceId: id });
      options.onPaired?.({ id, name, pairedAt });
      return result;
    },

    issueOwnerPasswordDevice(input) {
      if (input.humanId !== ownerHumanId() || !/^[a-f0-9]{64}$/u.test(input.publicKey))
        return undefined;
      const id = token(16);
      const secret = token(32);
      const pairedAt = iso(now());
      const name = deviceName(input.name);
      database.transaction(
        (connection) =>
          connection
            .prepare(
              `INSERT INTO paired_devices
                (device_id, name, secret_hash, paired_at, public_key, human_id, enrollment)
               VALUES (?, ?, ?, ?, ?, ?, 'owner-password')`,
            )
            .run(
              id,
              name,
              digest(secret).toString('hex'),
              pairedAt,
              input.publicKey,
              input.humanId,
            ),
        ['paired-devices'],
      );
      record({ phase: 'owner-password-enrolled', deviceId: id });
      options.onPaired?.({ id, name, pairedAt, enrollment: 'owner-password' });
      return { deviceId: id, credential: `${id}.${secret}` };
    },

    admit(authorization, noisePublicKey) {
      if (authorization?.startsWith('Device member.')) {
        const member = options.members?.admit(authorization, noisePublicKey);
        return member
          ? { ok: true, device: member }
          : { ok: false, code: options.members?.refusal(authorization) ?? 'device-unknown' };
      }
      const match = CREDENTIAL.exec(authorization?.trim() ?? '');
      if (match === null) {
        record({ phase: 'device-refused', code: 'device-credential-missing' });
        return { ok: false, code: 'device-credential-missing' };
      }
      const deviceId = match[1]!;
      const current = row(deviceId);
      const presented = digest(match[2]!);
      if (
        current === undefined ||
        !timingSafeEqual(presented, Buffer.from(current.secret_hash, 'hex')) ||
        ((noisePublicKey !== undefined || current.enrollment === 'owner-password') &&
          (noisePublicKey === undefined || current.public_key !== noisePublicKey))
      ) {
        record({ phase: 'device-refused', code: 'device-unknown' });
        return { ok: false, code: 'device-unknown' };
      }
      return active(current);
    },

    check(deviceId) {
      const member = options.members?.check(deviceId);
      if (member) return { ok: true, device: member };
      const current = row(deviceId);
      if (current === undefined) {
        record({ phase: 'device-refused', code: 'device-unknown', deviceId });
        return { ok: false, code: 'device-unknown' };
      }
      return active(current);
    },

    acknowledgeFeed(deviceId) {
      const current = row(deviceId);
      if (current === undefined) return { ok: false, code: 'device-unknown' };
      const admission = active(current);
      if (!admission.ok || current.feed_read_at !== null) return admission;
      database.transaction(
        (connection) =>
          connection
            .prepare(
              'UPDATE paired_devices SET feed_read_at = ? WHERE device_id = ? AND revoked_at IS NULL AND feed_read_at IS NULL',
            )
            .run(iso(now()), deviceId),
        ['paired-devices'],
      );
      return { ok: true, device: device(row(deviceId)!) };
    },

    list() {
      return (
        database.read((connection) =>
          connection
            .prepare('SELECT * FROM paired_devices ORDER BY paired_at DESC, device_id')
            .all(),
        ) as unknown as Row[]
      ).map(device);
    },

    revoke(deviceId) {
      forgetRedemption(deviceId);
      const known = row(deviceId) !== undefined;
      const changed = database.transaction(
        (connection) =>
          connection
            .prepare(
              'UPDATE paired_devices SET revoked_at = ? WHERE device_id = ? AND revoked_at IS NULL',
            )
            .run(iso(now()), deviceId).changes,
        ['paired-devices'],
      );
      const open = [...(streams.get(deviceId) ?? [])];
      streams.delete(deviceId);
      for (const close of open) close();
      const revoked = Number(changed) !== 0 || open.length !== 0;
      if (revoked) record({ phase: 'device-revoked', deviceId, closedStreams: open.length });
      if (known || revoked) options.onRevoked?.(deviceId);
      return { revoked, closedStreams: open.length };
    },

    closeStreams() {
      const open = [...streams.values()].flatMap((group) => [...group]);
      streams.clear();
      for (const close of open) close();
      return open.length;
    },
    attachStream(deviceId, close) {
      if (options.members?.check(deviceId)) return options.members.attach(deviceId, close);
      const open = streams.get(deviceId) ?? new Set();
      open.add(close);
      streams.set(deviceId, open);
      return () => {
        open.delete(close);
        if (open.size === 0 && streams.get(deviceId) === open) streams.delete(deviceId);
      };
    },
  };
}
