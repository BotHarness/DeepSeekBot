import type { createLanBotMembership, LanBotCandidate } from './bot-lan-membership.js';
import { noiseFingerprint } from './noise/xk.js';

export function createLanBotControl(options: {
  membership: ReturnType<typeof createLanBotMembership>;
  candidates(): readonly LanBotCandidate[];
  identity(): Promise<LanBotCandidate>;
  state(): 'off' | 'listening' | 'error';
  changed(hostId: string): Promise<void>;
}) {
  const publicIdentity = (identity: LanBotCandidate) => ({
    hostId: identity.hostId,
    name: identity.name,
    publicKey: identity.publicKey,
    fingerprint: noiseFingerprint(Buffer.from(identity.publicKey, 'hex')),
  });
  async function snapshot() {
    const candidates = new Map(options.candidates().map((peer) => [peer.hostId, peer]));
    const records = new Map(options.membership.list().map((record) => [record.hostId, record]));
    return {
      state: options.state(),
      host: publicIdentity(await options.identity()),
      peers: [...new Set([...candidates.keys(), ...records.keys()])].sort().map((id) => {
        const candidate = candidates.get(id);
        const record = records.get(id);
        const identity = candidate ?? record!;
        return {
          ...publicIdentity(identity),
          discovered: candidate !== undefined,
          admitted: record?.revokedAt === null && record.publicKey === identity.publicKey,
          approval: record?.revokedAt === null ? publicIdentity(record) : null,
          identityChanged: record !== undefined && record.publicKey !== identity.publicKey,
        };
      }),
    };
  }
  return {
    snapshot,
    async admit(input: { hostId: string; publicKey: string }) {
      if (options.state() !== 'listening') throw new Error('network-candidate-unavailable');
      options.membership.admit(input);
      await options.changed(input.hostId);
      return snapshot();
    },
    async revoke(hostId: string) {
      options.membership.revoke(hostId);
      await options.changed(hostId);
      return snapshot();
    },
  };
}
export type LanBotControl = ReturnType<typeof createLanBotControl>;
export type LanBotSnapshot = Awaited<ReturnType<LanBotControl['snapshot']>>;
