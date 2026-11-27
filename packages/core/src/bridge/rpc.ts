import { toRemoteError } from '../kernel/rpc-result.js';
import { markRemoteMethods, markRemoteStreams } from './remote-descriptors.js';
import { TeamError } from '../team-policy/error.js';
import { type TeamService } from '../team/service.js';
import { type HumanContext } from '../humans/context.js';
import type { AllBotPreview } from '../channels/all-bot-mention.js';
import type { Context } from '@deepseek-ai/cordis';
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { PrivateInputs } from '../credentials/private-inputs.js';
import type { BridgeMethods } from './methods.js';
import { teamServiceRpc } from '../features/team/rpc.js';
import {
  featureContributions,
  mergeFeatureMethods,
  type RegisteredFeatures,
} from '../feature-contributions.js';
import { resolveInvocationHuman } from './invocation-human.js';
import type { BridgeLive } from './rpc-types.js';
export { resolveInvocationHuman } from './invocation-human.js';
export type { BridgeLive } from './rpc-types.js';

export const BRIDGE_NAMESPACE = 'botharness';
export const BRIDGE_SERVICE_KEY = 'botharnessBridge';

declare module '@deepseek-ai/dsh-typert-protocol/types' {
  interface RemoteErrorDetailsMap {
    'all-bot-preview-changed': { preview: AllBotPreview };
    'invalid-input': Record<string, never>;
    'connector-not-configured': Record<string, never>;
    'connector-unavailable': Record<string, never>;
    'session-input-not-pending': Record<string, never>;
    'invalid-slug': Record<string, never>;
    duplicate: Record<string, never>;
    'not-found': Record<string, never>;
    'storage-unavailable': Record<string, never>;
    'unknown-workspace': Record<string, never>;
    'unavailable-workspace': Record<string, never>;
    'invalid-grant': Record<string, never>;
    'invalid-git-url': Record<string, never>;
    'git-clone-failed': Record<string, never>;
    'git-clone-timeout': Record<string, never>;
    'marketplace-unavailable': Record<string, never>;
  }
}

export { SECRET_ROUTE_METHODS, secretRouteRefusal } from './secret-route.js';

export type InvocationBridgeMethods = (human: HumanContext) => BridgeMethods;

export class BotharnessBridgeService extends TypertRemoteService {
  private readonly invocationMethods: InvocationBridgeMethods;

  private invocationHuman(): HumanContext {
    const human = resolveInvocationHuman(
      this.ctx.invocation?.peer,
      this.ctx.get('connection'),
      this.team,
    );
    const invocation = this.ctx.invocation;
    if (invocation && this.team) {
      try {
        this.team.assertCall(invocation.peer.principal, invocation.request?.method ?? '');
      } catch (error) {
        if (error instanceof TeamError)
          throw toRemoteError({
            code: error.code,
            message: error.code,
            ...(error.details ? { details: error.details } : {}),
          });
        throw error;
      }
    }
    if (human === undefined)
      throw new RemoteError('forbidden' as RemoteError['code'], 'Authenticated Human required', {});
    return human;
  }

  private get methods(): BridgeMethods {
    return this.invocationMethods(this.invocationHuman());
  }

  constructor(
    ctx: Context,
    methods: InvocationBridgeMethods,
    private readonly privateInputs?: PrivateInputs,
    private readonly live?: BridgeLive,
    private readonly team?: TeamService,
  ) {
    super(ctx, BRIDGE_SERVICE_KEY, { namespace: BRIDGE_NAMESPACE });
    this.invocationMethods = methods;
  }
}

const legacyRpcMethods = {
  ...teamServiceRpc,
};

function contributedRpcMethods(features: RegisteredFeatures) {
  return mergeFeatureMethods(
    features.flatMap((feature) => ('rpc' in feature ? [feature.rpc] : [])),
  );
}

function contributedRpcStreams(features: RegisteredFeatures) {
  return mergeFeatureMethods(
    features.flatMap((feature) => ('streams' in feature ? [feature.streams] : [])),
  );
}

type PublicRpcMethods = typeof legacyRpcMethods &
  ReturnType<typeof contributedRpcMethods> &
  ReturnType<typeof contributedRpcStreams>;

export interface BotharnessBridgeService extends PublicRpcMethods {}

const legacyRemoteMethods = [
  'botVisibility',
  'botVisibilitySet',
  'botSwitches',
  'reachableBots',
  'botProactiveOptOut',
  'roleConflicts',
  'memberPermissions',
  'speakerPolicy',
  'privateObjects',
  'privateContentOpen',
  'privateContentPage',
  'auditLog',
  'auditVerify',
  'spaces',
  'spaceAudienceDirectory',
  'spaceCreate',
  'spaceUpdate',
  'spaceDelete',
  'teamMode',
  'modelsAllowed',
  'usageByMember',
  'teamModeSet',
  'ownerPasswordSignIn',
  'ownerPasswordSignInSet',
  'teamOwnerPasswordSet',
  'teamInsecureHttpSet',
  'members',
  'memberCreate',
  'permissionCatalog',
  'roles',
  'roleCreate',
  'roleUpdate',
  'roleDelete',
  'memberRolesSet',
  'memberDevices',
  'memberDeviceRevoke',
  'ownerTransfer',
  'memberPasswordChange',
  'memberPasswordReset',
  'memberInvitation',
  'memberPairingOffer',
  'channelRoleDirectory',
  'channelBotSettings',
  'channelVisibilitySet',
  'channelAdminsSet',
  'channelPolicySet',
  'channelHumanAdd',
  'channelMemberCandidates',
  'channelDescriptionSet',
  'teamDirectory',
  'humanDm',
  'humanDmByUsername',
  'memberDeactivate',
  'memberReactivate',
  'memberTransferPreview',
  'memberTransfer',
  'memberPurgePreview',
  'memberPurgeConfirm',
  'channelPublicSet',
];
function installRemoteMethods(prototype: object, features: RegisteredFeatures): void {
  const contributions = contributedRpcMethods(features);
  const streams = contributedRpcStreams(features);
  const methods = mergeFeatureMethods([legacyRpcMethods, contributions, streams]);
  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(prototype, name, { configurable: true, writable: true, value: method });
  }
  markRemoteMethods(prototype, legacyRemoteMethods.concat(Object.keys(contributions)));
  markRemoteStreams(prototype, Object.keys(streams));
}

installRemoteMethods(BotharnessBridgeService.prototype, featureContributions);

export function registerBridge(
  ctx: Context,
  methods: InvocationBridgeMethods,
  privateInputs?: PrivateInputs,
  live?: BridgeLive,
  team?: TeamService,
  features: RegisteredFeatures = featureContributions,
): BotharnessBridgeService {
  if (features === featureContributions)
    return new BotharnessBridgeService(ctx, methods, privateInputs, live, team);
  class HostBridgeService extends BotharnessBridgeService {}
  installRemoteMethods(HostBridgeService.prototype, features);
  return new HostBridgeService(ctx, methods, privateInputs, live, team);
}
