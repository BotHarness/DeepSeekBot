import type * as diagnosticsFeature from './features/diagnostics/plugin.js';
import type * as releaseFeature from './features/release/plugin.js';
import { BotNetworkDeliveryError } from './runtime/bot-network.js';
import type { TobSettingsProvider } from './tob/service.js';
import type { Context } from '@deepseek-ai/cordis';
import type { DiagnosticEvents } from './diagnostics/diagnostic-log.js';
import { recordDatabaseStartup } from './diagnostics/database-startup.js';
import { emitPersonaBotOutputCommitted } from './channels/output.js';
import type { NativeSessionArchive } from './runtime/bot-runtime.js';
import type { ChannelToolApproval } from './workspaces/tool-approval.js';
import type { ChannelUserQuestions } from './channels/user-questions.js';
import type { PrivateInputs } from './credentials/private-inputs.js';
import type { DshWorkspaceLookup } from './workspaces/grants.js';
import type { createDshBotAgentAdapter } from './runtime/dsh-bot-agent-adapter.js';
import {
  readAssignmentReportPage,
  readBoundedAssignmentTail,
  type AssignmentSessionQuery,
} from './runtime/assignment-tail.js';
import type { DshSessionEvent } from './sessions/source.js';
import { turnProgress } from './bots/tool-trace.js';
import type * as models from './features/models/plugin.js';
import type { CoreOptions } from './plugin-types.js';
import type { BotHarnessCore } from './plugin-types.js';

export function createHostCoreOptions(
  ctx: Context,
  deps: Pick<ReturnType<typeof models.createFallback>, 'routeRests' | 'groupFallback'> & {
    dshHome: string;
    engineHost: ReturnType<typeof models.mountEngines>['engineHost'];
    agentAdapter: ReturnType<typeof createDshBotAgentAdapter>;
    modelCatalog: ReturnType<typeof models.createCatalog>['modelCatalog'];
    diagnosticEvents: DiagnosticEvents;
    updateLifecycle: ReturnType<typeof releaseFeature.apply>['updateLifecycle'];
    telemetry: ReturnType<typeof diagnosticsFeature.mountTelemetry>['telemetry'];
    readonly core: BotHarnessCore;
    readonly botNetwork: CoreOptions['botNetwork'];
    readonly userQuestions: ChannelUserQuestions | undefined;
    readonly toolApproval: ChannelToolApproval | undefined;
    readonly privateInputs: PrivateInputs | undefined;
    readonly imCommandServices: ReturnType<NonNullable<CoreOptions['imCommands']>>;
  },
): CoreOptions {
  const {
    dshHome,
    routeRests,
    engineHost,
    groupFallback,
    agentAdapter,
    modelCatalog,
    diagnosticEvents,
    updateLifecycle,
    telemetry,
  } = deps;
  return {
    legacyDefaultModel: () => {
      const main = ctx.get('agentDefaultModel')?.currentSelection();
      return main === undefined ? {} : { main };
    },
    routeRests,
    requireAssignmentEngine: (slug, target) => engineHost.assertAssignmentAccount(slug, target),
    groupFallback,
    sessionRoute: (botSlug, sessionId) =>
      groupFallback.route(sessionId) ??
      agentAdapter.modelSelection(sessionId) ??
      deps.core.registry.get(botSlug)?.modelPlan?.orchestrator ??
      modelCatalog.defaultRoute?.(),
    engineFallback: (botSlug, limit) => {
      if (!engineHost.fallsBack(botSlug)) return undefined;
      const to =
        deps.core.registry.get(botSlug)?.modelPlan?.orchestrator ?? modelCatalog.defaultRoute?.();
      if (to === undefined) return undefined;
      return {
        kind: 'switch',
        from: { provider: limit.engine, model: limit.account },
        to: { ...to },
        reason: 'quota',
        until: limit.until,
      };
    },
    startupDiagnostic: diagnosticEvents,
    databaseDiagnostic: (snapshot) => {
      recordDatabaseStartup(diagnosticEvents, snapshot);
      updateLifecycle.startup(snapshot.startup.instanceId, snapshot.startup.stage);
    },
    credentials: () => ctx.get('credentials'),
    voiceLog: (phase, fields) => diagnosticEvents.record('voice', phase, fields),
    botNetwork: {
      contacts: () => deps.botNetwork?.contacts() ?? [],
      availability: (hostId, botSlug) =>
        deps.botNetwork?.availability?.(hostId, botSlug) ?? 'unavailable',
      refresh: async () => {
        await deps.botNetwork?.refresh?.();
      },
      membership: (hostId) =>
        deps.botNetwork?.membership?.(hostId) ?? Promise.resolve('unavailable'),
      send: (hostId, message) =>
        deps.botNetwork === undefined
          ? Promise.reject(new BotNetworkDeliveryError('unable-to-deliver'))
          : deps.botNetwork.send(hostId, message),
    },
    dshHome,
    triageContinuation: true,
    companionProfileDir: (ctx.get('profileContext') as { dir: string } | undefined)?.dir,
    onOutputCommitted: (event) =>
      emitPersonaBotOutputCommitted(ctx, event, (message) => ctx.logger.warn(message)),
    activeQuestionMessageIds: () => deps.userQuestions?.activeMessageIds() ?? [],
    activeToolApprovalMessageIds: () => deps.toolApproval?.activeMessageIds() ?? [],
    closeSessionApprovals: (sessionIds) => deps.toolApproval?.closeSessions(sessionIds),
    activePrivateInputMessageIds: () => deps.privateInputs?.activeMessageIds() ?? [],
    erasePrivateAccounts: async (slug) => {
      await deps.privateInputs?.mcpServers?.erase(slug);
      await deps.privateInputs?.eraseBot(slug);
    },
    capture: (event, properties) => telemetry.capture(event, properties),
    warn: (message) => ctx.logger.warn(message),
    agents: agentAdapter,
    saveReportSpill: async ({ sessionId, content }) => {
      const spillStore = ctx.get('spillStore') as unknown as
        | {
            saveText(input: {
              owner: { sessionId: string };
              source: {
                kind: 'session-reference';
                sessionId: string;
                label: string;
              };
              suggestedName: string;
              content: string;
            }): Promise<{
              locator: string;
              bytes: number;
              retrievalHint: string;
            }>;
          }
        | undefined;
      if (spillStore === undefined) throw new Error('DSH Spill service is unavailable');
      return spillStore.saveText({
        owner: { sessionId },
        source: {
          kind: 'session-reference',
          sessionId,
          label: 'Assignment report',
        },
        suggestedName: 'assignment-report.txt',
        content,
      });
    },
    readAssignmentTail: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readBoundedAssignmentTail(query, sessionId);
    },
    readTurnProgress: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as
        | {
            readSession(id: string): Promise<{ events: readonly DshSessionEvent[] }>;
          }
        | undefined;
      if (query === undefined) return undefined;
      return turnProgress((await query.readSession(sessionId)).events);
    },
    readAssignmentReportPage: async (sessionId, acceptedSummary, offset, content) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readAssignmentReportPage(query, sessionId, acceptedSummary, offset, content);
    },
    ensureTobWorkspace: async (path) => {
      const owner = ctx.get('workspaceRegistry') as unknown as
        | { create(path: string, title: string): Promise<{ id: string }> }
        | undefined;
      if (!owner) throw new Error('workspace-unavailable');
      return owner.create(path, 'Tob');
    },
    tobSettings: () => ctx.get('settings') as unknown as TobSettingsProvider | undefined,
    workspaces: () => ctx.get('workspaceRegistry') as unknown as DshWorkspaceLookup | undefined,
    sessionArchive: () =>
      ctx.get('workspaceRegistry') as unknown as NativeSessionArchive | undefined,
    imCommands: () => deps.imCommandServices,
  };
}
