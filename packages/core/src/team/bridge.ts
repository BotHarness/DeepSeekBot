import { PERMISSION_CATALOG } from './permissions.js';
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
      return {
        ok: false,
        error: {
          code,
          message: code,
          ...(error instanceof TeamError && error.details ? { details: error.details } : {}),
        },
      };
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
    permissionCatalog: (_payload: unknown) =>
      call(() => PERMISSION_CATALOG.map((entry) => ({ ...entry }))),
    roles: (_payload: unknown) => call((service) => service.roles.list(human)),
    roleCreate: (payload: unknown) =>
      call((service) => {
        const { name, permissions } = z
          .object({ name: z.string(), permissions: z.array(z.string()) })
          .parse(payload);
        return service.roles.create(human, name, permissions);
      }),
    roleUpdate: (payload: unknown) =>
      call((service) => {
        const { roleId, ...patch } = z
          .object({
            roleId: z.string(),
            name: z.string().optional(),
            permissions: z.array(z.string()).optional(),
          })
          .parse(payload);
        return service.roles.update(human, roleId, {
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.permissions === undefined ? {} : { permissions: patch.permissions }),
        });
      }),
    roleDelete: (payload: unknown) =>
      call((service) =>
        service.roles.delete(human, z.object({ roleId: z.string() }).parse(payload).roleId),
      ),
    memberRolesSet: (payload: unknown) =>
      call((service) => {
        const { humanId, roleIds } = z
          .object({ humanId: z.string(), roleIds: z.array(z.string()) })
          .parse(payload);
        return service.roles.set(human, humanId, roleIds);
      }),
    memberDevices: (payload: unknown, currentGrantId?: string) =>
      call((service) =>
        service.memberDevices(
          human,
          z.object({ humanId: z.string() }).parse(payload).humanId,
          currentGrantId,
        ),
      ),
    memberDeviceRevoke: (payload: unknown) =>
      call((service) => {
        const { humanId, grantId } = z
          .object({ humanId: z.string(), grantId: z.string() })
          .parse(payload);
        return service.memberDeviceRevoke(human, humanId, grantId);
      }),
    ownerTransfer: (payload: unknown) =>
      call((service) => {
        const { humanId, password } = z
          .object({ humanId: z.string(), password: z.string().max(1024) })
          .parse(payload);
        return service.transferOwner(human, humanId, password);
      }),
    members: (_payload: unknown) => call((service) => service.members(human)),
    memberCreate: (payload: unknown) =>
      call((service) => {
        const { username, displayName, roleIds } = z
          .object({
            username: z.string(),
            displayName: z.string(),
            roleIds: z.array(z.string()).optional(),
          })
          .parse(payload);
        return service.createMember(human, username, displayName, roleIds);
      }),
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
