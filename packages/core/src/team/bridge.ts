import { z } from 'zod';
import type { HumanContext } from '../humans/context.js';
import type { BridgeResult } from '../bridge/methods.js';
import { TeamError, type TeamService } from './service.js';

export function createTeamBridge(human: HumanContext, team: TeamService | undefined) {
  const call = async <T>(
    run: (service: TeamService) => T | Promise<T>,
  ): Promise<BridgeResult<T>> => {
    try {
      if (!team) throw new TeamError('unavailable');
      return { ok: true, value: await run(team) };
    } catch (error) {
      const code =
        error instanceof TeamError
          ? error.code
          : error instanceof z.ZodError
            ? 'invalid-input'
            : 'internal';
      return { ok: false, error: { code, message: code } };
    }
  };
  return {
    teamMode: (_payload: unknown) => call((service) => service.mode(human)),
    teamModeSet: (payload: unknown) =>
      call((service) =>
        service.setMode(human, z.object({ enabled: z.boolean() }).parse(payload).enabled),
      ),
    teamOwnerPasswordSet: (payload: unknown) =>
      call((service) => {
        const { password, current } = z
          .object({ password: z.string().max(1024), current: z.string().max(1024).optional() })
          .parse(payload);
        return service.setOwnerPassword(human, password, current);
      }),
    teamInsecureHttpSet: (payload: unknown) =>
      call((service) =>
        service.setInsecureHttp(human, z.object({ allowed: z.boolean() }).parse(payload).allowed),
      ),
    members: (_payload: unknown) => call((service) => service.members(human)),
    memberCreate: (payload: unknown) =>
      call((service) => {
        const { username, displayName } = z
          .object({ username: z.string(), displayName: z.string() })
          .parse(payload);
        return service.createMember(human, username, displayName);
      }),
    memberInvitation: (payload: unknown) =>
      call((service) =>
        service.invitation(human, z.object({ humanId: z.string().min(1) }).parse(payload).humanId),
      ),
    memberPairingOffer: (_payload: unknown) => call((service) => service.pairingOffer(human)),
    memberPasswordReset: (payload: unknown) =>
      call((service) =>
        service.resetPassword(
          human,
          z.object({ humanId: z.string().min(1) }).parse(payload).humanId,
        ),
      ),
    memberPasswordChange: (payload: unknown) =>
      call((service) => {
        const { current, next } = z
          .object({ current: z.string().max(1024), next: z.string().max(1024) })
          .parse(payload);
        return service.changePassword(human, current, next);
      }),
    publicChannels: (_payload: unknown) => call((service) => service.publicChannels(human)),
    publicChannelJoin: (payload: unknown) =>
      call((service) =>
        service.joinPublic(
          human,
          z.object({ channelId: z.string().min(1) }).parse(payload).channelId,
        ),
      ),
    channelPublicSet: (payload: unknown) =>
      call((service) => {
        const input = z
          .object({ channelId: z.string().min(1), public: z.boolean() })
          .parse(payload);
        return service.setPublic(human, input.channelId, input.public);
      }),
  };
}
export type TeamBridgeMethods = ReturnType<typeof createTeamBridge>;
