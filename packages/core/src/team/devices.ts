import { z } from 'zod';
import { memberUrls } from './member-urls.js';
import { TeamError, type TeamService } from './service.js';
import { pairingLink, qrPath } from '../devices/http.js';
import type { DevicePairing, HostIdentity } from '../devices/pairing.js';
import type { EncryptionIdentity } from '../devices/noise-identity.js';

export const deviceSignInSchema = z.object({
  username: z.string().max(32),
  password: z.string().max(1024),
  deviceName: z.string().trim().min(1).max(60),
  fingerprint: z.string().max(128),
});
export interface MemberInvitation {
  link: string;
  qr: { size: number; path: string };
  expiresAt: string;
}
export interface MemberPairingOffer extends MemberInvitation {
  receipt: string;
}
export type MemberDeviceSignIn = ReturnType<TeamService['deviceGrantResult']> & {
  host: HostIdentity & { fingerprint: string };
};

export function createMemberDevices(options: {
  team: TeamService;
  pairing: DevicePairing;
  encryption(): Promise<EncryptionIdentity>;
  routes(): Promise<string[]>;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const host = async () => ({
    ...options.pairing.host(),
    fingerprint: (await options.encryption()).fingerprint,
  });
  const routes = async () => memberUrls(await options.routes(), false);
  return {
    async invitation(humanId: string): Promise<MemberInvitation> {
      const member = options.team.member(humanId);
      if (!member) throw new TeamError('member-not-found');
      const expiresAt = new Date(now() + 10 * 60_000).toISOString();
      const payload = {
        v: 1,
        host: await host(),
        routes: await routes(),
        username: member.username,
        expiresAt,
      };
      const link = `deepseekbot://team?i=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
      return { link, qr: qrPath(link), expiresAt };
    },
    async pairingOffer(humanId: string): Promise<MemberPairingOffer> {
      const encryption = await options.encryption();
      const addresses = await routes();
      const member = options.team.member(humanId);
      if (!options.team.mode({ humanId }).enabled) throw new TeamError('team-mode-off');
      if (!member || member.status !== 'active') throw new TeamError('member-suspended');
      if (member.mustChangePassword) throw new TeamError('password-change-required');
      const offer = options.pairing.createOffer({ humanId });
      const link = pairingLink({
        v: 1,
        member: true,
        host: options.pairing.host(),
        encryption,
        routes: addresses,
        offer: offer.offer,
        expiresAt: offer.expiresAt,
      });
      return { link, qr: qrPath(link), expiresAt: offer.expiresAt, receipt: offer.receipt };
    },
    async signIn(input: unknown, ip: string, publicKey?: string): Promise<MemberDeviceSignIn> {
      const parsed = deviceSignInSchema.parse(input);
      const identity = await host();
      if (parsed.fingerprint !== identity.fingerprint) throw new TeamError('fingerprint-mismatch');
      const signed = await options.team.signIn(parsed.username, parsed.password, ip, {
        kind: 'paired-device',
        name: parsed.deviceName,
        ...(publicKey === undefined ? {} : { publicKey }),
      });
      return { ...options.team.deviceGrantResult(signed, signed.member), host: identity };
    },
  };
}
export type MemberDevices = ReturnType<typeof createMemberDevices>;
