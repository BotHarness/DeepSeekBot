import { createMemberTobOperations } from '../../tob/member-operations.js';
import { botOwner, privateBotRegistry } from '../../team/bot-access.js';
import { privateBotCreations } from '../../bots/creation.js';
import { humanContext } from '../../humans/context.js';
import { TOB_CHANNEL_CAPABILITIES } from '../../tob/cli-channel-operations.js';
import { TOB_BOT_CREATE_CAPABILITIES } from '../../tob/cli-bot-create.js';
import { TOB_BOT_PROFILE_CAPABILITIES } from '../../tob/cli-bot-profile-operations.js';
import { TOB_DIAGNOSTIC_CAPABILITIES } from '../../tob/cli-diagnostic-operations.js';
import { authorizeTobBotTargets, TOB_HOST_CLI_CAPABILITY } from '../../tob/cli-host-commands.js';
import { TOB_SHARE_DRAFT_CAPABILITIES } from '../../tob/cli-share-draft-operations.js';
import { TobError } from '../../tob/service.js';
import { TOB_MODEL_CAPABILITIES } from '../../tob/cli-model-operations.js';
import { TOB_MAINTENANCE_CAPABILITIES } from '../../tob/cli-maintenance-operations.js';
import { installTobCliShell } from '../../tob/cli-shell.js';
import { TOB_VOICE_CAPABILITIES } from '../../tob/cli-voice-operations.js';
import { approveTobCliOperation } from '../../tob/cli-approval.js';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { installOrchestratorFileTools } from '../../workspaces/orchestrator-file-tools.js';
import { nativeExecutionRoot } from '../../workspaces/grant-native-tools.js';
import { grantExecutionDenial, sessionHasFullAccess } from '../../workspaces/grant-execution.js';
import type { ChannelToolApproval } from '../../workspaces/tool-approval.js';
import type {
  createDshBotAgentAdapter,
  DshAgentPresetHost,
} from '../../runtime/dsh-bot-agent-adapter.js';
import type * as voice from '../voice/plugin.js';
import { ModelFreeTobCliInvocation } from '../../tob/cli-invocation.js';
import { createTobChannelOperations } from '../../tob/cli-channel-operations.js';
import { createTobBotCreationOperations } from '../../tob/cli-bot-create.js';
import { createTobBotProfileOperations } from '../../tob/cli-bot-profile-operations.js';
import { createTobDiagnosticOperations } from '../../tob/cli-diagnostic-operations.js';
import {
  createTobHostCliOperations,
  authorizeTobHostCli,
  spawnHostCli,
} from '../../tob/cli-host-commands.js';
import { createTobShareDraftOperations } from '../../tob/cli-share-draft-operations.js';
import { createTobService } from '../../tob/service.js';
import {
  createTobModelOperations,
  type TobNativeSettings,
} from '../../tob/cli-model-operations.js';
import { createTobMaintenanceOperations } from '../../tob/cli-maintenance-operations.js';
import { cliModulePath } from '../../tob/cli-shell.js';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { createBridgeMethodsForHumans } from '../../bridge/methods.js';
import type { createLoadingReleaseService } from '../../release/service.js';
import type { createGitService } from '../../memory/managed-git.js';
import type { createTelemetryService } from '../../telemetry/service.js';
import type { createHostModelCatalog } from '../../models/host-models.js';
import { attachOperationalModule } from '../../database/owner.js';
import type * as skillsFeature from '../skills/plugin.js';
import type { BotHarnessCore, createCore } from '../../plugin.js';
import type * as diagnosticsFeature from '../diagnostics/plugin.js';
import type { InvocationBridgeMethods } from '../../bridge/rpc.js';

type CoreOptions = NonNullable<Parameters<typeof createCore>[0]>;

export function apply({
  operationalDatabase,
  registry,
  channels,
  grants,
  dshHome,
  spaces,
  options,
}: {
  operationalDatabase: BotHarnessCore['operationalDatabase'];
  registry: BotHarnessCore['registry'];
  channels: BotHarnessCore['channels'];
  grants: BotHarnessCore['grants'];
  spaces: BotHarnessCore['spaces'];
  dshHome: string;
  options: Pick<CoreOptions, 'ensureTobWorkspace' | 'tobSettings'>;
}) {
  const tob = createTobService({
    database: attachOperationalModule(operationalDatabase, 'tob'),
    registry,
    channels,
    grants,
    workspaceRoot: join(dshHome, 'botharness', 'tob-workspaces'),
    workspaceFor: (human) => spaces.ensureAccount(human.humanId),
    ...(options.ensureTobWorkspace ? { ensureWorkspace: options.ensureTobWorkspace } : {}),
    ...(options.tobSettings ? { settings: options.tobSettings } : {}),
  });
  return tob;
}

export function mountSettingsOperations(
  ctx: Context,
  core: Pick<BotHarnessCore, 'registry' | 'team' | 'modelPresets'>,
  {
    modelCatalog,
    developerMode,
    telemetry,
    git,
    releaseService,
  }: {
    modelCatalog: ReturnType<typeof createHostModelCatalog>['modelCatalog'];
    developerMode: ReturnType<typeof skillsFeature.createDeveloperMode>;
    telemetry: ReturnType<typeof createTelemetryService>;
    git: ReturnType<typeof createGitService>;
    releaseService: ReturnType<typeof createLoadingReleaseService>;
  },
) {
  const tobModelOperations = createTobModelOperations({
    registry: core.registry,
    human: () => core.team.ownerContext(),
    presets: core.modelPresets,
    catalog: modelCatalog,
    settings: () => ctx.get('settings') as unknown as TobNativeSettings | undefined,
    runtimeChanged: (patch) => {
      if (typeof patch.developerMode === 'boolean') developerMode.set(patch.developerMode);
    },
  });
  const tobMaintenanceOperations = createTobMaintenanceOperations({
    telemetry,
    git,
    release: releaseService,
  });
  return { tobModelOperations, tobMaintenanceOperations };
}

export function mountOperations(
  ctx: Context,
  core: Pick<
    BotHarnessCore,
    'registry' | 'creations' | 'team' | 'tob' | 'channels' | 'channelManagement'
  >,
  {
    bridgeMethods,
    diagnosticEvents,
    hostDiagnosticEnvironment,
    readWebServices,
  }: {
    bridgeMethods: ReturnType<ReturnType<typeof createBridgeMethodsForHumans>>;
    diagnosticEvents: ReturnType<typeof diagnosticsFeature.apply>['diagnosticEvents'];
    readWebServices(ctx: Context): {
      connection: { authenticatedUrl(baseUrl: string): string };
      webServer: { getOrigin(): string };
    };
    hostDiagnosticEnvironment: ReturnType<
      typeof diagnosticsFeature.apply
    >['hostDiagnosticEnvironment'];
  },
) {
  const tobBotCreationOperations = createTobBotCreationOperations({
    registry: core.registry,
    creations: core.creations,
    bridge: bridgeMethods,
  });
  const tobBotProfileOperations = createTobBotProfileOperations({
    registry: core.registry,
    human: () => core.team.ownerContext(),
    bridge: () => bridgeMethods,
    isProtectedBot: (slug) => core.tob.isTob(slug),
  });
  const tobShareDraftOperations = createTobShareDraftOperations({
    bridge: () => bridgeMethods,
  });
  const tobDiagnosticOperations = createTobDiagnosticOperations({
    list: (query) => diagnosticEvents.list(query),
    updateRun: () => {
      const run = bridgeMethods.updateRun({});
      if (!run.ok) throw new Error(run.error.code);
      return run.value;
    },
    environment: hostDiagnosticEnvironment,
  });
  let tobHostTarget: (() => { origin: string; token: string } | undefined) | undefined;
  ctx.inject(['connection', 'webServer'], (webCtx) => {
    const services = readWebServices(webCtx);
    webCtx.effect(() => {
      tobHostTarget = () => {
        const origin = services.webServer.getOrigin();
        const token = [
          ...new URL(services.connection.authenticatedUrl(`${origin}/`)).searchParams.values(),
        ][0];
        return token ? { origin, token } : undefined;
      };
      return () => {
        tobHostTarget = undefined;
      };
    }, 'botharness: Tob Host CLI target');
  });
  const tobHostCliOperations = createTobHostCliOperations({
    authorize: (argv) =>
      authorizeTobHostCli(argv, {
        registry: core.registry,
        channels: core.channels,
        human: core.team.ownerContext(),
      }),
    run: spawnHostCli({ modulePath: cliModulePath, host: () => tobHostTarget?.() }),
  });
  const tobChannelOperations = createTobChannelOperations({
    management: core.channelManagement,
    channels: core.channels,
    registry: core.registry,
    isProtectedBot: (slug) => core.tob.isTob(slug),
  });
  return {
    tobBotCreationOperations,
    tobBotProfileOperations,
    tobShareDraftOperations,
    tobDiagnosticOperations,
    tobHostCliOperations,
    tobChannelOperations,
  };
}

export function createCliInvocation() {
  return new ModelFreeTobCliInvocation();
}

export interface TobShellDependencies {
  readonly core: BotHarnessCore;
  readonly team: BotHarnessCore['team'];
  tobCliInvocation: ReturnType<typeof createCliInvocation>;
  readonly agentAdapter: ReturnType<typeof createDshBotAgentAdapter>;
  readonly invocationBridgeMethods: InvocationBridgeMethods;
  readonly tobSettingsOperations: ReturnType<typeof mountSettingsOperations>;

  readonly tobOperations: ReturnType<typeof mountOperations>;

  readonly tobVoiceOperations: ReturnType<typeof voice.mountCalls>;
  readonly toolApproval: ChannelToolApproval | undefined;
}

export function createOrchestratorFileSetup(
  ctx: Context,
  deps: TobShellDependencies,
): NonNullable<Parameters<typeof createDshBotAgentAdapter>[0]['onOrchestratorFileSetup']> {
  return (agentCtx, agent) =>
    installOrchestratorFileTools(
      agentCtx,
      agent,
      ctx.get('agentPresets') as DshAgentPresetHost | undefined,
      (name, args) => nativeExecutionRoot(deps.core, agent.session, name, args),
      (shellCtx, shell) =>
        installTobCliShell(shellCtx, shell, {
          nativeCli: {
            available: () =>
              deps.core.tob.isTob(deps.core.ownership.resolve(agent.session.id)?.botSlug ?? '') &&
              deps.agentAdapter.ownsModelFreeTobTurn(agent),
            register: (definition) =>
              deps.tobCliInvocation.register(agent, definition, () => {
                if (!deps.core.runtime.captureTobCliAuthority)
                  throw new TobError('tob-authority-required');
                return deps.core.runtime.captureTobCliAuthority(agent.session.id);
              }),
            require: (execution) => deps.tobCliInvocation.require(execution),
          },
          capture: (execution) => {
            const actor = execution.agent;
            if (
              !actor ||
              !deps.core.tob.isTob(deps.core.ownership.resolve(actor.session.id)?.botSlug ?? '')
            )
              return undefined;

            const steward = deps.core.registry.get(
              deps.core.ownership.resolve(actor.session.id)!.botSlug,
            );
            if (!steward) return undefined;
            const human = humanContext(botOwner(steward));
            const memberTob = !deps.core.team.isOwner(human);
            const memberOperations = memberTob
              ? createMemberTobOperations({
                  human,
                  bridge: deps.invocationBridgeMethods(human),
                  registry: privateBotRegistry(deps.core.registry, human),
                  creations: privateBotCreations(deps.core.creations, human),
                  isProtectedBot: (slug) => deps.core.tob.isTob(slug),
                })
              : undefined;
            const requireOwner = () => {
              if (!deps.core.team.isOwner(human)) throw new TobError('permission-required');
            };
            const source = (() => {
              try {
                const authority = deps.core.runtime.captureTobCliAuthority?.(actor.session.id);
                if (!authority) throw new TobError('tob-authority-required');
                return { authorize: authority, beginWrite: authority.beginWrite };
              } catch (error) {
                const refuse = () => {
                  throw error;
                };
                return { authorize: refuse, beginWrite: refuse };
              }
            })();
            const requireAuthority = (requireOrigin: () => void) => {
              if (execution.signal.aborted) throw new TobError('agent-context-expired');
              requireOrigin();
              if (
                memberTob &&
                (!deps.team.mode(human).enabled ||
                  deps.team.member(human.humanId)?.status !== 'active')
              )
                throw new TobError('permission-required');
              const denial = grantExecutionDenial(
                deps.core,
                actor.session,
                ctx.get('sandboxPolicy'),
                ctx.get('approval'),
              );
              if (denial) throw new TobError('tob-authority-required');
            };
            const started = Date.now();
            return {
              signal: execution.signal,
              authorize: () => requireAuthority(source.authorize),
              beginWrite: () => {
                const scope = source.beginWrite();
                return { ...scope, authorize: () => requireAuthority(scope.authorize) };
              },
              prepareOperation: async (command, args, signal) => {
                const checkTargets = () =>
                  authorizeTobBotTargets(args, {
                    registry: deps.core.registry,
                    channels: deps.core.channels,
                    human,
                  });
                checkTargets();
                if (memberOperations) return memberOperations(command, args, signal);
                const prepared =
                  (await deps.tobSettingsOperations.tobModelOperations(command, args)) ??
                  (await deps.tobSettingsOperations.tobMaintenanceOperations(command, args)) ??
                  (await deps.tobOperations.tobBotCreationOperations(command, args)) ??
                  (await deps.tobOperations.tobBotProfileOperations(command, args)) ??
                  (await deps.tobOperations.tobShareDraftOperations(command, args)) ??
                  (await deps.tobOperations.tobDiagnosticOperations(command, args)) ??
                  (await deps.tobOperations.tobChannelOperations(command, args)) ??
                  (await deps.tobVoiceOperations(command, args)) ??
                  (await deps.tobOperations.tobHostCliOperations(command, args, signal));
                if (!prepared) return prepared;
                const scopedGuard = (guard: () => void) => () => {
                  guard();
                  checkTargets();
                };
                if (!['create', 'group-create'].includes(command))
                  return {
                    ...prepared,
                    run: (guard, beforeEffect) => prepared.run(scopedGuard(guard), beforeEffect),
                  };
                return {
                  ...prepared,
                  run: async (guard, beforeEffect) => {
                    guard();
                    deps.core.onboarding.trackCreation(
                      command,
                      String(args.operationKey),
                      actor.session.id,
                      started,
                    );
                    return prepared.run(scopedGuard(guard), beforeEffect);
                  },
                };
              },
              capabilities: memberTob
                ? [
                    ...TOB_BOT_CREATE_CAPABILITIES,
                    ...TOB_BOT_PROFILE_CAPABILITIES,
                    TOB_HOST_CLI_CAPABILITY,
                  ]
                : [
                    ...TOB_MODEL_CAPABILITIES,
                    ...TOB_MAINTENANCE_CAPABILITIES,
                    ...TOB_BOT_CREATE_CAPABILITIES,
                    ...TOB_BOT_PROFILE_CAPABILITIES,
                    ...TOB_SHARE_DRAFT_CAPABILITIES,
                    ...TOB_DIAGNOSTIC_CAPABILITIES,
                    ...TOB_CHANNEL_CAPABILITIES,
                    ...TOB_VOICE_CAPABILITIES,
                    TOB_HOST_CLI_CAPABILITY,
                  ],
              readSetting: () => {
                requireOwner();
                return deps.core.tob.readSetting();
              },
              writeSetting: (value, revision, guard) => {
                requireOwner();
                return deps.core.tob.writeSetting(value, revision, guard);
              },
              approve: (operation, signal, scope) =>
                approveTobCliOperation({
                  execution,
                  operation,
                  signal,
                  ...scope,
                  approval: ctx.get('approval') as ApprovalService | undefined,
                  channelApproval: deps.toolApproval,
                  fullAccess: () => sessionHasFullAccess(deps.core, actor.session.id),
                }),
              log: (phase, details) =>
                ctx.logger.info('tob-cli %j', {
                  phase,
                  sessionId: actor.session.id,
                  callId: execution.callId,
                  initiator: 'tob-native-shell',
                  durationMs: Date.now() - started,
                  ...details,
                }),
            };
          },
        }),
    );
}
