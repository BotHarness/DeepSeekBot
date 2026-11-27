import { botOwner } from '../../team-policy/bot-access.js';
import { humanContext, type HumanContext } from '../../humans/context.js';
import { TOB_CHANNEL_CAPABILITIES } from './cli-channel-operations.js';
import { TOB_BOT_CREATE_CAPABILITIES } from './cli-bot-create.js';
import { TOB_BOT_PROFILE_CAPABILITIES } from './cli-bot-profile-operations.js';
import {
  createTobMemoryEditOperations,
  TOB_MEMORY_EDIT_CAPABILITIES,
} from './cli-memory-edit-operations.js';
import { TOB_DIAGNOSTIC_CAPABILITIES } from './cli-diagnostic-operations.js';
import {
  authorizeTobBotTargets,
  TobCliCommandError,
  TOB_HOST_CLI_CAPABILITY,
} from './cli-host-commands.js';
import type { ManagementCapability } from '../../bots/management-grants.js';
import { managementCapabilitiesFor, managementCapabilityList } from './management-scope.js';
import { TOB_SHARE_DRAFT_CAPABILITIES } from './cli-share-draft-operations.js';
import { TobError } from '../../tob/service.js';
import { managerShellAuthority } from './cli-runtime.js';
import { TOB_MODEL_CAPABILITIES } from './cli-model-operations.js';
import { TOB_MAINTENANCE_CAPABILITIES } from './cli-maintenance-operations.js';
import { installTobCliShell } from './cli-shell.js';
import { createTobMemoryLeases } from '../../tob/memory-lease.js';
import {
  createTobAssignmentLeaseOperations,
  createTobMemoryLeaseOperations,
  TOB_ASSIGNMENT_LEASE_CAPABILITIES,
  TOB_MEMORY_LEASE_CAPABILITIES,
} from './cli-memory-lease-operations.js';
import { installAssignmentShell } from '../../workspaces/assignment-shell.js';
import { TOB_VOICE_CAPABILITIES } from './cli-voice-operations.js';
import { approveTobCliOperation } from './cli-approval.js';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { installOrchestratorFileTools } from '../../workspaces/orchestrator-file-tools.js';
import { nativeExecutionRoot } from '../../workspaces/grant-native-tools.js';
import { grantExecutionDenial, sessionHasFullAccess } from '../../workspaces/grant-execution.js';
import type { ChannelToolApproval } from '../../workspaces/tool-approval.js';
import type {
  createDshBotAgentAdapter,
  DshAgentPresetHost,
  DshBotAgentAdapterOptions,
} from '../../runtime/dsh-bot-agent-adapter.js';
import type * as voice from '../voice/plugin.js';
import { ModelFreeTobCliInvocation } from '../../runtime/tob-cli-invocation.js';
import { createTobChannelOperations } from './cli-channel-operations.js';
import { createTobBotCreationOperations } from './cli-bot-create.js';
import { privateBotCreations } from '../../bots/creation.js';
import { createTobBotProfileOperations } from './cli-bot-profile-operations.js';
import { createTobDiagnosticOperations } from './cli-diagnostic-operations.js';
import {
  createTobHostCliOperations,
  authorizeTobHostCli,
  spawnHostCli,
} from './cli-host-commands.js';
import { createTobShareDraftOperations } from './cli-share-draft-operations.js';
import { createTobService } from '../../tob/service.js';
import { createTobModelOperations, type TobNativeSettings } from './cli-model-operations.js';
import { createTobMaintenanceOperations } from './cli-maintenance-operations.js';
import { cliModulePath } from './cli-shell.js';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { BridgeMethods } from '../../bridge/methods.js';
import type { ReleaseService } from '../../release/service.js';
import type { GitService } from '../../memory/managed-git.js';
import type { TelemetryService } from '../../telemetry/service.js';
import type { ModelCatalog } from '../../models/catalog.js';
import { attachOperationalModule } from '../../database/owner.js';
import type { DeveloperMode } from '../skills/plugin.js';
import type { BotHarnessCore, createCore } from '../../plugin.js';
import type * as diagnosticsFeature from '../diagnostics/plugin.js';

type CoreOptions = NonNullable<Parameters<typeof createCore>[0]>;

const OWNER_BOT_CAPABILITIES = [
  ...TOB_MODEL_CAPABILITIES,
  ...TOB_MAINTENANCE_CAPABILITIES,
  ...TOB_BOT_CREATE_CAPABILITIES,
  ...TOB_BOT_PROFILE_CAPABILITIES,
  ...TOB_MEMORY_EDIT_CAPABILITIES,
  ...TOB_SHARE_DRAFT_CAPABILITIES,
  ...TOB_DIAGNOSTIC_CAPABILITIES,
  ...TOB_CHANNEL_CAPABILITIES,
  ...TOB_VOICE_CAPABILITIES,
  ...TOB_MEMORY_LEASE_CAPABILITIES,
  TOB_HOST_CLI_CAPABILITY,
];

export const MEMBER_BOT_CAPABILITIES = [
  ...TOB_BOT_CREATE_CAPABILITIES,
  ...TOB_BOT_PROFILE_CAPABILITIES.filter(
    (entry) =>
      !['pause', 'resume'].includes(entry.command) && !entry.command.startsWith('bot-delete-'),
  ),
  ...TOB_MEMORY_EDIT_CAPABILITIES,
  ...TOB_SHARE_DRAFT_CAPABILITIES,
];

const MEMBER_BOT_COMMANDS = new Set(MEMBER_BOT_CAPABILITIES.map((entry) => entry.command));

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
    modelCatalog: ModelCatalog;
    developerMode: Pick<DeveloperMode, 'set'>;
    telemetry: TelemetryService;
    git: GitService;
    releaseService: ReleaseService;
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
    | 'registry'
    | 'creations'
    | 'team'
    | 'tob'
    | 'channels'
    | 'channelManagement'
    | 'operationalDatabase'
    | 'ownership'
    | 'memory'
  >,
  {
    bridgeMethods,
    bridgeFor,
    diagnosticEvents,
    hostDiagnosticEnvironment,
    readWebServices,
  }: {
    bridgeMethods: BridgeMethods;
    bridgeFor(human: HumanContext): BridgeMethods;
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
    isProtectedBot: (slug) => core.tob.holdsManagementGrant(slug),
  });
  const tobMemoryEditOperations = createTobMemoryEditOperations({
    registry: core.registry,
    memory: () => core.memory,
    human: () => core.team.ownerContext(),
    isProtectedBot: (slug) => core.tob.holdsManagementGrant(slug),
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
        holdsManagementGrant: (slug) => core.tob.holdsManagementGrant(slug),
      }),
    run: spawnHostCli({ modulePath: cliModulePath, host: () => tobHostTarget?.() }),
  });
  const tobChannelOperations = createTobChannelOperations({
    management: core.channelManagement,
    channels: core.channels,
    registry: core.registry,
  });
  const tobMemoryLeases = createTobMemoryLeases({
    database: attachOperationalModule(core.operationalDatabase, 'tob'),
    registry: core.registry,
    ownership: core.ownership,
    memory: () => core.memory,
    canManageBots: (slug) => core.tob.holdsManagementGrant(slug, 'manage-bots'),
  });
  const memberOperations = (human: HumanContext) => {
    const bridge = bridgeFor(human);
    const creation = createTobBotCreationOperations({
      registry: core.registry,
      creations: privateBotCreations(core.creations, human, () => core.team.isOwner(human)),
      bridge,
    });
    const profile = createTobBotProfileOperations({
      registry: core.registry,
      human: () => human,
      bridge: () => bridge,
      isProtectedBot: (slug) => core.tob.holdsManagementGrant(slug),
    });
    const memoryEdit = createTobMemoryEditOperations({
      registry: core.registry,
      memory: () => core.memory,
      human: () => human,
      isProtectedBot: (slug) => core.tob.holdsManagementGrant(slug),
    });
    const shareDraft = createTobShareDraftOperations({ bridge: () => bridge });
    return async (command: string, args: Record<string, unknown>) =>
      (await creation(command, args)) ??
      (await profile(command, args)) ??
      (await memoryEdit(command, args)) ??
      (await shareDraft(command, args));
  };
  return {
    memberOperations,
    tobMemoryLeases,
    tobBotCreationOperations,
    tobBotProfileOperations,
    tobMemoryEditOperations,
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
  tobCliInvocation: Pick<ModelFreeTobCliInvocation, 'register' | 'require'>;
  readonly agentAdapter: Pick<ReturnType<typeof createDshBotAgentAdapter>, 'ownsModelFreeTobTurn'>;
  readonly tobSettingsOperations: ReturnType<typeof mountSettingsOperations>;

  readonly tobOperations: ReturnType<typeof mountOperations>;

  readonly tobVoiceOperations: ReturnType<typeof voice.mountCalls>;
  readonly toolApproval: ChannelToolApproval | undefined;
}

export type TobAgentHooks = Pick<
  DshBotAgentAdapterOptions,
  'onOrchestratorFileSetup' | 'onAssignmentShellSetup' | 'assignmentReportFooter'
>;

export function createAgentHooks(ctx: Context, deps: TobShellDependencies): TobAgentHooks {
  return {
    onOrchestratorFileSetup: createOrchestratorFileSetup(ctx, deps),
    onAssignmentShellSetup: createAssignmentShellSetup(ctx, deps),
    assignmentReportFooter: (sessionId) =>
      deps.tobOperations.tobMemoryLeases.reportFooter(sessionId),
  };
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
              deps.core.tob.holdsManagementGrant(
                deps.core.ownership.resolve(agent.session.id)?.botSlug ?? '',
              ) && deps.agentAdapter.ownsModelFreeTobTurn(agent),
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
            const slug = actor && deps.core.ownership.resolve(actor.session.id)?.botSlug;
            if (!actor || !slug || !deps.core.tob.holdsManagementGrant(slug)) return undefined;
            const manager = deps.core.registry.get(slug);
            if (!manager) return undefined;
            const human = humanContext(botOwner(manager));
            const ownerBot = deps.core.team.isOwner(human);
            const memberOperations = ownerBot
              ? undefined
              : deps.tobOperations.memberOperations(human);
            const requireGrant = (capability: ManagementCapability) => {
              if (!deps.core.tob.holdsManagementGrant(slug, capability))
                throw new TobCliCommandError(
                  `${capability}-required`,
                  capability === 'manage-app'
                    ? 'This Bot cannot manage the App. The Human can turn on "Manage the App" for it in Bot settings.'
                    : 'This Bot cannot manage other Bots. The Human can turn on "Manage other Bots" for it in Bot settings.',
                );
            };
            const source = managerShellAuthority(() =>
              deps.core.runtime.captureTobCliAuthority?.(actor.session.id),
            );
            const requireAuthority = (requireOrigin: () => void) => {
              if (execution.signal.aborted) throw new TobError('agent-context-expired');
              requireOrigin();
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
              authorize: () => {
                requireAuthority(source);
                if (!deps.core.tob.holdsManagementGrant(slug))
                  throw new TobError('tob-authority-required');
              },
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
                const required = managementCapabilitiesFor(command, args, slug, deps.core);
                required.forEach(requireGrant);
                if (memberOperations) {
                  if (!MEMBER_BOT_COMMANDS.has(command))
                    throw new TobCliCommandError(
                      'owner-bot-required',
                      'This command is only available to Bots of the Owner.',
                    );
                  const prepared = await memberOperations(command, args);
                  return prepared
                    ? {
                        ...prepared,
                        run: (guard, beforeEffect) => {
                          const recheck = () => {
                            guard();
                            required.forEach(requireGrant);
                            checkTargets();
                          };
                          recheck();
                          return prepared.run(recheck, beforeEffect);
                        },
                      }
                    : prepared;
                }
                const lease = createTobMemoryLeaseOperations({
                  leases: () => deps.tobOperations.tobMemoryLeases,
                  tobSlug: () => manager.slug,
                  sources: () => {
                    requireAuthority(source);
                    return source.sources;
                  },
                })(command, args, signal);
                if (lease) return lease;
                const prepared =
                  (await deps.tobSettingsOperations.tobModelOperations(command, args)) ??
                  (await deps.tobSettingsOperations.tobMaintenanceOperations(command, args)) ??
                  (await deps.tobOperations.tobBotCreationOperations(command, args)) ??
                  (await deps.tobOperations.tobBotProfileOperations(command, args)) ??
                  (await deps.tobOperations.tobMemoryEditOperations(command, args)) ??
                  (await deps.tobOperations.tobShareDraftOperations(command, args)) ??
                  (await deps.tobOperations.tobDiagnosticOperations(command, args)) ??
                  (await deps.tobOperations.tobChannelOperations(command, args)) ??
                  (await deps.tobVoiceOperations(command, args)) ??
                  (await deps.tobOperations.tobHostCliOperations(command, args, signal));
                if (!prepared) return prepared;
                const scopedGuard = (guard: () => void) => () => {
                  guard();
                  required.forEach(requireGrant);
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
              capabilities: managementCapabilityList(
                deps.core.tob.managementGrants(slug),
                ownerBot ? OWNER_BOT_CAPABILITIES : MEMBER_BOT_CAPABILITIES,
              ),
              readSetting: () => deps.core.tob.readSetting(),
              writeSetting: (value, revision, guard) =>
                deps.core.tob.writeSetting(value, revision, guard),
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

export function createAssignmentShellSetup(
  ctx: Context,
  deps: TobShellDependencies,
): NonNullable<Parameters<typeof createDshBotAgentAdapter>[0]['onAssignmentShellSetup']> {
  return async (agentCtx, agent) => {
    const owner = deps.core.ownership.resolve(agent.session.id);
    if (
      owner?.rootRole !== 'assignment' ||
      !deps.core.tob.holdsManagementGrant(owner.botSlug, 'manage-bots')
    )
      return undefined;
    const assignmentSessionId = agent.session.id;
    const leases = () => deps.tobOperations.tobMemoryLeases;
    return installAssignmentShell(
      agentCtx,
      agent,
      ctx.get('agentPresets') as DshAgentPresetHost | undefined,
      (shellCtx, shell) =>
        installTobCliShell(shellCtx, shell, {
          capture: (execution) => {
            if (execution.agent !== agent) return undefined;
            const started = Date.now();
            const authorize = () => {
              if (execution.signal.aborted) throw new TobError('agent-context-expired');
              const current = deps.core.ownership.resolve(assignmentSessionId);
              if (
                current?.rootRole !== 'assignment' ||
                !deps.core.tob.holdsManagementGrant(current.botSlug, 'manage-bots')
              )
                throw new TobError('tob-authority-required');
              if (!leases().active(assignmentSessionId)) throw new TobError('lease-unavailable');
            };
            const readOnly = (): never => {
              throw new TobError('lease-read-only');
            };
            return {
              signal: execution.signal,
              authorize,
              readSetting: readOnly,
              writeSetting: readOnly,
              approve: async () => readOnly(),
              prepareOperation: createTobAssignmentLeaseOperations({
                leases,
                assignmentSessionId,
              }),
              capabilities: TOB_ASSIGNMENT_LEASE_CAPABILITIES,
              log: (phase, details) =>
                ctx.logger.info('tob-cli %j', {
                  phase,
                  sessionId: assignmentSessionId,
                  callId: execution.callId,
                  initiator: 'tob-assignment-lease',
                  durationMs: Date.now() - started,
                  ...details,
                }),
            };
          },
        }),
    );
  };
}
