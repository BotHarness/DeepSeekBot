import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { PrivateKind } from '../../team/private-contract.js';
import type { SpaceAudience } from '../../workspaces/spaces.js';
import type { ChannelVisibility, ChannelPolicy } from '../../team/channel-contract.js';
import { type TeamService } from '../../team/service.js';
import type { UsageOverviewPeriod } from '../../usage/overview.js';
import type { Context } from '@deepseek-ai/cordis';
import type { TeamBridgeMethods } from './methods.js';

export function spaceAudienceDirectory(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.spaceAudienceDirectory({}));
}

export function spaces(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.spaces({}));
}

export function botVisibility(methods: TeamBridgeMethods, slug: string) {
  return unwrapAsync(methods.botVisibility({ slug }));
}

export function botVisibilitySet(
  methods: TeamBridgeMethods,
  slug: string,
  visibility: import('../../team/bot-contract.js').BotVisibility,
  confirm?: boolean,
) {
  return unwrapAsync(methods.botVisibilitySet({ slug, visibility, confirm }));
}

export function botSwitches(
  methods: TeamBridgeMethods,
  slug: string,
  proactiveDms?: boolean,
  joinPrincipalChannels?: boolean,
  speakerContext?: boolean,
) {
  return unwrapAsync(
    methods.botSwitches({
      slug,
      ...(proactiveDms === undefined ? {} : { proactiveDms }),
      ...(joinPrincipalChannels === undefined ? {} : { joinPrincipalChannels }),
      ...(speakerContext === undefined ? {} : { speakerContext }),
    }),
  );
}

export function reachableBots(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.reachableBots({}));
}

export function botProactiveOptOut(methods: TeamBridgeMethods, slug: string, optOut: boolean) {
  return unwrapAsync(methods.botProactiveOptOut({ slug, optOut }));
}

export function roleConflicts(methods: TeamBridgeMethods, humanId?: string, username?: string) {
  return unwrapAsync(methods.roleConflicts({ humanId, username }));
}

export function speakerPolicy(methods: TeamBridgeMethods, humanId?: string, topic?: string) {
  return unwrapAsync(methods.speakerPolicy({ humanId, topic }));
}

export function spaceCreate(methods: TeamBridgeMethods, name: string, audience: SpaceAudience) {
  return unwrapAsync(methods.spaceCreate({ name, audience }));
}

export function spaceUpdate(
  methods: TeamBridgeMethods,
  spaceId: string,
  name?: string,
  audience?: SpaceAudience,
) {
  return unwrapAsync(methods.spaceUpdate({ spaceId, name, audience }));
}

export function spaceDelete(methods: TeamBridgeMethods, spaceId: string, confirm: boolean) {
  return unwrapAsync(methods.spaceDelete({ spaceId, confirm }));
}

export function modelsAllowed(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.modelsAllowed({}));
}

export function usageByMember(methods: TeamBridgeMethods, period: UsageOverviewPeriod) {
  return unwrap(methods.usageByMember({ period }));
}

export function privateObjects(
  methods: TeamBridgeMethods,
  humanId?: string,
  kind?: PrivateKind,
  username?: string,
) {
  return unwrapAsync(methods.privateObjects({ humanId, kind, username }));
}

export function privateContentOpen(
  methods: TeamBridgeMethods,
  kind: PrivateKind,
  objectId: string,
  reason?: string,
) {
  return unwrapAsync(methods.privateContentOpen({ kind, objectId, reason }));
}

export function privateContentPage(methods: TeamBridgeMethods, viewId: string, before: string) {
  return unwrapAsync(methods.privateContentPage({ viewId, before }));
}

export function auditLog(methods: TeamBridgeMethods, after?: string, limit?: number) {
  return unwrapAsync(methods.auditLog({ after, limit }));
}

export function auditVerify(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.auditVerify({}));
}

export function teamMode(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.teamMode({}));
}

export function teamModeSet(methods: TeamBridgeMethods, enabled: boolean) {
  return unwrapAsync(methods.teamModeSet({ enabled }));
}

export function ownerPasswordSignIn(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.ownerPasswordSignIn({}));
}

export function ownerPasswordSignInSet(
  methods: TeamBridgeMethods,
  enabled: boolean,
  username?: string,
  password?: string,
) {
  return unwrapAsync(methods.ownerPasswordSignInSet({ enabled, username, password }));
}

export function teamOwnerPasswordSet(
  methods: TeamBridgeMethods,
  password: string,
  current?: string,
  signOutOthers?: boolean,
) {
  return unwrapAsync(methods.teamOwnerPasswordSet({ password, current, signOutOthers }));
}

export function teamInsecureHttpSet(methods: TeamBridgeMethods, allowed: boolean) {
  return unwrapAsync(methods.teamInsecureHttpSet({ allowed }));
}

export function members(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.members({}));
}

export function memberCreate(
  methods: TeamBridgeMethods,
  username: string,
  displayName: string,
  roleIds?: string[],
) {
  return unwrapAsync(methods.memberCreate({ username, displayName, roleIds }));
}

export function permissionCatalog(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.permissionCatalog({}));
}

export function roles(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.roles({}));
}

export function roleCreate(
  methods: TeamBridgeMethods,
  name: string,
  permissions: string[],
  models?: import('../../team/permissions.js').RoleModels,
  policy?: import('../../team/bot-contract.js').RolePolicy,
) {
  return unwrapAsync(methods.roleCreate({ name, permissions, models, policy }));
}

export function roleUpdate(
  methods: TeamBridgeMethods,
  roleId: string,
  name?: string,
  permissions?: string[],
  models?: import('../../team/permissions.js').RoleModels,
  policy?: import('../../team/bot-contract.js').RolePolicy,
) {
  return unwrapAsync(methods.roleUpdate({ roleId, name, permissions, models, policy }));
}

export function roleDelete(methods: TeamBridgeMethods, roleId: string) {
  return unwrapAsync(methods.roleDelete({ roleId }));
}

export function memberRolesSet(methods: TeamBridgeMethods, humanId: string, roleIds: string[]) {
  return unwrapAsync(methods.memberRolesSet({ humanId, roleIds }));
}

export function memberDevices(methods: () => TeamBridgeMethods, context: Context, humanId: string) {
  const principal = context.invocation?.peer.principal;
  return unwrapAsync(
    methods().memberDevices(
      { humanId },
      principal?.kind === 'botharness-member' ? principal.grantId : undefined,
    ),
  );
}

export function memberDeviceRevoke(methods: TeamBridgeMethods, humanId: string, grantId: string) {
  return unwrapAsync(methods.memberDeviceRevoke({ humanId, grantId }));
}

export function ownerTransfer(methods: TeamBridgeMethods, humanId: string, password: string) {
  return unwrapAsync(methods.ownerTransfer({ humanId, password }));
}

export function memberPasswordChange(
  methods: () => TeamBridgeMethods,
  context: Context,
  team: TeamService | undefined,
  current: string,
  next: string,
  signOutOthers?: boolean,
) {
  const principal = context.invocation?.peer.principal;
  if (principal?.kind === 'botharness-member' && team)
    return team.withPasswordCaller(principal, undefined, () =>
      unwrapAsync(methods().memberPasswordChange({ current, next, signOutOthers })),
    );
  return unwrapAsync(methods().memberPasswordChange({ current, next, signOutOthers }));
}

export function memberInvitation(methods: TeamBridgeMethods, humanId: string) {
  return unwrapAsync(methods.memberInvitation({ humanId }));
}

export function memberPairingOffer(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.memberPairingOffer({}));
}

export function memberPasswordReset(methods: TeamBridgeMethods, humanId: string) {
  return unwrapAsync(methods.memberPasswordReset({ humanId }));
}

export function channelRoleDirectory(methods: TeamBridgeMethods, channelId: string) {
  return unwrapAsync(methods.channelRoleDirectory({ channelId }));
}

export function channelVisibilitySet(
  methods: TeamBridgeMethods,
  channelId: string,
  visibility: ChannelVisibility,
) {
  return unwrapAsync(methods.channelVisibilitySet({ channelId, visibility }));
}

export function channelAdminsSet(
  methods: TeamBridgeMethods,
  channelId: string,
  humanIds: string[],
) {
  return unwrapAsync(methods.channelAdminsSet({ channelId, humanIds }));
}

export function channelPolicySet(
  methods: TeamBridgeMethods,
  channelId: string,
  policy: ChannelPolicy,
  expectedRevision?: string,
) {
  return unwrapAsync(
    methods.channelPolicySet({
      channelId,
      policy,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }),
  );
}

export function channelMemberCandidates(
  methods: TeamBridgeMethods,
  channelId: string,
  query?: string,
) {
  return unwrapAsync(
    methods.channelMemberCandidates({
      channelId,
      ...(query === undefined ? {} : { query }),
    }),
  );
}

export function channelHumanAdd(methods: TeamBridgeMethods, channelId: string, humanId: string) {
  return unwrapAsync(methods.channelHumanAdd({ channelId, humanId }));
}

export function channelDescriptionSet(
  methods: TeamBridgeMethods,
  channelId: string,
  description: string,
) {
  return unwrapAsync(methods.channelDescriptionSet({ channelId, description }));
}

export function teamDirectory(methods: TeamBridgeMethods) {
  return unwrapAsync(methods.teamDirectory({}));
}

export function humanDm(methods: TeamBridgeMethods, humanId: string) {
  return unwrapAsync(methods.humanDm({ humanId }));
}

export function humanDmByUsername(methods: TeamBridgeMethods, username: string) {
  return unwrapAsync(methods.humanDmByUsername({ username }));
}

export function memberDeactivate(methods: TeamBridgeMethods, humanId: string) {
  return unwrapAsync(methods.memberDeactivate({ humanId }));
}

export function memberReactivate(methods: TeamBridgeMethods, humanId: string) {
  return unwrapAsync(methods.memberReactivate({ humanId }));
}

export function memberTransferPreview(methods: TeamBridgeMethods, humanId: string) {
  return unwrapAsync(methods.memberTransferPreview({ humanId }));
}

export function memberTransfer(methods: TeamBridgeMethods, humanId: string, toHumanId: string) {
  return unwrapAsync(methods.memberTransfer({ humanId, toHumanId }));
}

export function memberPurgePreview(methods: TeamBridgeMethods, humanId: string) {
  return unwrapAsync(methods.memberPurgePreview({ humanId }));
}

export function memberPurgeConfirm(
  methods: TeamBridgeMethods,
  humanId: string,
  token: string,
  username: string,
) {
  return unwrapAsync(methods.memberPurgeConfirm({ humanId, token, username }));
}

export function channelPublicSet(
  methods: TeamBridgeMethods,
  channelId: string,
  publicValue: boolean,
) {
  return unwrapAsync(methods.channelPublicSet({ channelId, public: publicValue }));
}
