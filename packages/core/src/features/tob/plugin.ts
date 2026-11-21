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
import { createBridgeMethodsForHumans } from '../../bridge/methods.js';
import { createLoadingReleaseService } from '../../release/service.js';
import { createGitService } from '../../memory/managed-git.js';
import { createTelemetryService } from '../../telemetry/service.js';
import { createHostModelCatalog } from '../../models/host-models.js';
import { attachOperationalModule } from '../../database/owner.js';
import { type DshDefaultModelHost } from '../../runtime/dsh-bot-agent-adapter.js';
import * as skillsFeature from '../skills/plugin.js';
import type { BotHarnessCore, createCore } from '../../plugin.js';
import type * as diagnosticsFeature from '../diagnostics/plugin.js';
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
  core: Pick<BotHarnessCore, 'registry' | 'team' | 'modelPresets' | 'routingGroups'>,
  {
    modelCatalog,
    defaultModel,
    developerMode,
    telemetry,
    git,
    releaseService,
  }: {
    modelCatalog: ReturnType<typeof createHostModelCatalog>['modelCatalog'];
    defaultModel: DshDefaultModelHost;
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
    defaultModel,
    routingGroups: core.routingGroups,
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
