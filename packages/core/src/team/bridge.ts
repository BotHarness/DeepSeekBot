import { roleModelsSchema, PERMISSION_CATALOG } from './permissions.js';
import {
  channelVisibilitySchema,
  channelPolicySchema,
  channelPolicyRevisionSchema,
} from './channel-contract.js';
import { ContentPurgeError } from '../purge/contracts.js';
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
      const value = await run(team);
      await team.accessSettled();
      return { ok: true, value };
    } catch (error) {
      const code =
        error instanceof TeamError || error instanceof ContentPurgeError
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
    modelsAllowed: (_payload: unknown) => call((service) => service.roles.modelsAllowed(human)),
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
            models: roleModelsSchema.optional(),
          })
          .parse(payload);
        return service.roles.update(human, roleId, {
          ...(patch.models === undefined ? {} : { models: patch.models }),
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
        const { current, next, signOutOthers } = z
          .object({
            current: z.string().max(1024),
            next: z.string().max(1024),
            signOutOthers: z.boolean().optional(),
          })
          .parse(payload);
        return service.changePassword(human, current, next, signOutOthers);
      }),
    memberDeactivate: (payload: unknown) =>
      call((service) =>
        service.deactivate(human, z.object({ humanId: z.string().min(1) }).parse(payload).humanId),
      ),
    memberReactivate: (payload: unknown) =>
      call((service) =>
        service.reactivate(human, z.object({ humanId: z.string().min(1) }).parse(payload).humanId),
      ),
    memberTransferPreview: (payload: unknown) =>
      call((service) =>
        service.transferPreview(
          human,
          z.object({ humanId: z.string().min(1) }).parse(payload).humanId,
        ),
      ),
    memberTransfer: (payload: unknown) =>
      call((service) => {
        const { humanId, toHumanId } = z
          .object({ humanId: z.string().min(1), toHumanId: z.string().min(1) })
          .parse(payload);
        return service.transfer(human, humanId, toHumanId);
      }),
    memberPurgePreview: (payload: unknown) =>
      call((service) =>
        service.purgePreview(
          human,
          z.object({ humanId: z.string().min(1) }).parse(payload).humanId,
        ),
      ),
    memberPurgeConfirm: (payload: unknown) =>
      call((service) => {
        const { humanId, token, username } = z
          .object({ humanId: z.string().min(1), token: z.string().max(1024), username: z.string() })
          .parse(payload);
        return service.purgeConfirm(human, humanId, token, username);
      }),
    channelRoleDirectory: (payload: unknown) =>
      call((service) =>
        service.channelAccess.roleDirectory(
          human,
          z.object({ channelId: z.string().min(1) }).parse(payload).channelId,
        ),
      ),
    browsableChannels: (_payload: unknown) =>
      call((service) => service.channelAccess.browse(human)),
    channelJoin: (payload: unknown) =>
      call((service) =>
        service.channelAccess.join(
          human,
          z.object({ channelId: z.string().min(1) }).parse(payload).channelId,
        ),
      ),
    channelVisibilitySet: (payload: unknown) =>
      call((service) => {
        const { channelId, visibility } = z
          .object({ channelId: z.string().min(1), visibility: channelVisibilitySchema })
          .parse(payload);
        return service.channelAccess.visibilitySet(human, channelId, visibility);
      }),
    channelAdminsSet: (payload: unknown) =>
      call((service) => {
        const { channelId, humanIds } = z
          .object({ channelId: z.string().min(1), humanIds: z.array(z.string()).max(1000) })
          .parse(payload);
        return service.channelAccess.adminsSet(human, channelId, humanIds);
      }),
    channelPolicySet: (payload: unknown) =>
      call((service) => {
        const { channelId, policy, expectedRevision } = z
          .object({
            channelId: z.string().min(1),
            policy: channelPolicySchema,
            expectedRevision: channelPolicyRevisionSchema.optional(),
          })
          .parse(payload);
        return service.channelAccess.policySet(human, channelId, policy, expectedRevision);
      }),
    teamDirectory: (_payload: unknown) => call((service) => service.channelAccess.directory(human)),
    humanDm: (payload: unknown) =>
      call((service) =>
        service.channelAccess.dm(
          human,
          z.object({ humanId: z.string().min(1) }).parse(payload).humanId,
        ),
      ),
    humanDmByUsername: (payload: unknown) =>
      call((service) => {
        service.roles.require(human, 'dm.humans');
        const { username } = z.object({ username: z.string().min(1) }).parse(payload);
        const target = service.memberByUsername(username);
        if (!target) throw new TeamError('member-not-found');
        return service.channelAccess.dm(human, target.humanId);
      }),
    channelHumanAdd: (payload: unknown) =>
      call((service) => {
        const { channelId, humanId } = z
          .object({ channelId: z.string().min(1), humanId: z.string().min(1) })
          .parse(payload);
        return service.channelAccess.addMember(human, channelId, humanId);
      }),
    channelDescriptionSet: (payload: unknown) =>
      call((service) => {
        const { channelId, description } = z
          .object({ channelId: z.string().min(1), description: z.string().max(4096) })
          .parse(payload);
        return service.channelAccess.descriptionSet(human, channelId, description);
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
