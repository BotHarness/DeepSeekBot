import {
  createDiagnosticBundleHttp,
  DIAGNOSTIC_BUNDLE_PATH,
  DIAGNOSTIC_BUNDLE_PREVIEW_PATH,
  type DiagnosticBundleHttpOptions,
} from '../../diagnostics/bundle-http.js';
import {
  createMessageFeedbackHttp,
  MESSAGE_FEEDBACK_PATH,
  MESSAGE_FEEDBACK_ACTIONS,
} from '../../diagnostics/message-feedback-http.js';
import { feedbackUploader } from '../../diagnostics/feedback-upload.js';
import { feedbackLinks } from '../../diagnostics/feedback-links.js';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { type Agent } from '@deepseek-ai/dsh-agent';
import { homedir } from 'node:os';
import { mountDiagnosticLog } from '../../diagnostics/diagnostic-log.js';
import type { DiagnosticEvents } from '../../diagnostics/diagnostic-log.js';
import { createTurnLog } from '../../diagnostics/turn-log.js';
import { installedRelease } from '../../release/service.js';
import {
  createTelemetryService,
  installedDshVersion,
  telemetryDecision,
} from '../../telemetry/service.js';
import { readDailyUsageCounts, startDailyUsage } from '../../telemetry/daily-usage.js';
import { startTokenUsage } from '../../telemetry/token-usage.js';
import { createBotTurnTelemetry } from '../../telemetry/bot-turn.js';
import {
  createActiveDay,
  readHumanMessageCounts,
  startActiveDayWatch,
} from '../../telemetry/active-day.js';
import {
  createClientIssueReporter,
  type ClientIssueReporter,
} from '../../telemetry/client-issues.js';
import { deliverPendingExceptions, installExceptionCapture } from '../../telemetry/exceptions.js';
import { attachOperationalModule } from '../../database/owner.js';
import type { DshSessionEvent, DshSessionStore } from '../../sessions/source.js';
import type { BotHarnessCore, BotHarnessConfig } from '../../plugin.js';

export function apply(
  ctx: Context,
  dshHome: string,
  runningRelease: { version: string },
  onClientIssues: () => ClientIssueReporter | undefined,
) {
  const hostDiagnosticEnvironment = () => {
    const dshVersion = installedDshVersion();
    return {
      version: runningRelease.version,
      ...(dshVersion === undefined ? {} : { dshVersion }),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    };
  };
  const diagnosticEvents = mountDiagnosticLog(ctx, {
    onClientEntries: (session, entries) => onClientIssues()?.observe(session, entries),
    dshHome,
    homes: [
      { path: dshHome, label: '$DSH_HOME' },
      { path: homedir(), label: '~' },
    ],
    environment: hostDiagnosticEnvironment,
  });
  return { hostDiagnosticEnvironment, diagnosticEvents };
}

export function mountFetch(
  ctx: Context,
  connectionCtx: Context,
  fetch: {
    register(route: {
      path: string;
      methods: readonly ('GET' | 'POST')[];
      requestBody: 'buffered' | 'streaming';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  },
  core: Pick<
    BotHarnessCore,
    | 'channels'
    | 'inboxHistory'
    | 'ownership'
    | 'operationalDatabase'
    | 'registry'
    | 'externalMessaging'
  >,
  {
    dshHome,
    dshSessions,
    runningRelease,
  }: { dshHome: string; dshSessions: DshSessionStore; runningRelease: { version: string } },
) {
  const dshVersion = installedDshVersion();
  const diagnosticOptions: DiagnosticBundleHttpOptions = {
    source: {
      channels: core.channels,
      inboxHistory: core.inboxHistory,
      ownership: core.ownership,
      feedbackLinks: (channelId, messageIds) =>
        feedbackLinks(
          attachOperationalModule(core.operationalDatabase, 'message-feedback'),
          channelId,
          messageIds,
        ),
      botName: (slug) => core.registry.get(slug)?.displayName,
      readDeliveries: async (slug) => (await core.externalMessaging.snapshot(slug)).intents,
      readSession: async (sessionId) => {
        const query = ctx.get('sessionQuery') as unknown as
          | {
              readSession(id: string): Promise<{ events: readonly DshSessionEvent[] }>;
            }
          | undefined;
        if (query !== undefined) return (await query.readSession(sessionId)).events;
        return dshSessions.get(sessionId)?.snapshotEvents();
      },
      environment: {
        version: runningRelease.version,
        ...(dshVersion === undefined ? {} : { dshVersion }),
        platform: process.platform,
        arch: process.arch,
        node: process.version,
      },
    },
    homes: [
      { path: dshHome, label: '$DSH_HOME' },
      { path: homedir(), label: '~' },
    ],
    log: (message) => ctx.logger.info(message),
  };
  const diagnosticBundleHttp = createDiagnosticBundleHttp(diagnosticOptions);
  const feedbackHttp = createMessageFeedbackHttp({
    ...diagnosticOptions,
    readTimeline: (human, id, request) => core.channels.readHumanTimeline(human, id, request),
    submit: feedbackUploader(),
  });
  for (const action of MESSAGE_FEEDBACK_ACTIONS)
    connectionCtx.effect(
      () =>
        fetch.register({
          path: `${MESSAGE_FEEDBACK_PATH}/${action}`,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: feedbackHttp,
        }),
      'botharness: message feedback ' + action,
    );
  for (const path of [DIAGNOSTIC_BUNDLE_PATH, DIAGNOSTIC_BUNDLE_PREVIEW_PATH])
    connectionCtx.effect(
      () =>
        fetch.register({
          path,
          methods: ['POST'],
          requestBody: 'buffered',
          fetch: diagnosticBundleHttp,
        }),
      'botharness: diagnostic bundle ' + path,
    );
}

export function createTurnDiagnostics(
  core: Pick<BotHarnessCore, 'ownership'>,
  diagnosticEvents: DiagnosticEvents,
) {
  const turnLog = createTurnLog({
    events: diagnosticEvents,
    owner: (sessionId) => core.ownership.resolve(sessionId),
  });
  return turnLog;
}

export function mountTelemetry(
  ctx: Context,
  dshHome: string,
  config: Pick<BotHarnessConfig, 'telemetry'>,
  release: ReturnType<typeof installedRelease>,
  publishClientIssues: (reporter: ClientIssueReporter) => void,
) {
  const telemetryChoice = telemetryDecision(config.telemetry);
  const telemetryDir = join(dshHome, 'botharness');
  const telemetry = createTelemetryService({
    decision: telemetryChoice,
    dataDir: telemetryDir,
    pluginVersion: release.version(),
    dshVersion: installedDshVersion(),
    log: (message) => ctx.logger.info(message),
  });
  const telemetryState = telemetry.status();
  ctx.logger.info(
    telemetryState.enabled
      ? 'telemetry phase=enabled'
      : `telemetry phase=disabled reason=${telemetryState.lockedBy ?? 'preference'}`,
  );
  ctx.effect(() => () => void telemetry.close(), 'botharness: telemetry');
  telemetry.capture('app:host_start');
  publishClientIssues(createClientIssueReporter({ telemetry }));
  const activeDay = createActiveDay({ telemetry, dataDir: telemetryDir });
  deliverPendingExceptions(telemetry, telemetryDir);
  if (telemetryState.lockedBy === undefined)
    ctx.effect(
      () =>
        installExceptionCapture({
          dataDir: telemetryDir,
          enabled: () => telemetry.enabled,
        }),
      'botharness: telemetry exceptions',
    );
  return { telemetry, telemetryDir, telemetryState, activeDay };
}

export function mountTelemetryWatches(
  ctx: Context,
  core: Pick<BotHarnessCore, 'operationalDatabase' | 'usage'>,
  { telemetry, telemetryDir, telemetryState, activeDay }: ReturnType<typeof mountTelemetry>,
) {
  if (core.operationalDatabase.mode === 'ready' && telemetryState.lockedBy === undefined) {
    const usageDatabase = attachOperationalModule(core.operationalDatabase, 'telemetry');
    ctx.effect(
      () =>
        startDailyUsage({
          telemetry,
          dataDir: telemetryDir,
          counts: (since, until) => readDailyUsageCounts(usageDatabase, since, until),
          log: (message) => ctx.logger.info(message),
        }),
      'botharness: telemetry daily usage',
    );
    ctx.effect(
      () =>
        startTokenUsage({
          telemetry,
          snapshot: () => core.usage?.telemetrySnapshot(),
          log: (message) => ctx.logger.info(message),
        }),
      'botharness: telemetry token usage',
    );
    ctx.effect(
      () =>
        startActiveDayWatch({
          activeDay,
          counts: (since) => readHumanMessageCounts(usageDatabase, since),
          log: (message) => ctx.logger.info(message),
        }),
      'botharness: telemetry active day',
    );
  }
}

export function createTurnTelemetry(
  ctx: Context,
  core: Pick<BotHarnessCore, 'ownership'>,
  telemetry: ReturnType<typeof createTelemetryService>,
  liveAgent: (sessionId: string) => Agent | undefined,
) {
  const botTurnTelemetry = createBotTurnTelemetry({
    telemetry,
    role: (sessionId) => core.ownership.resolve(sessionId)?.rootRole,
    measure: (sessionId) => {
      const agent = liveAgent(sessionId);
      const measurement = agent?.ctx.get('tokenMeter')?.measure(agent.session);
      if (agent === undefined || measurement === undefined) return undefined;
      return {
        nodes: measurement.nodes,
        totalTokens: measurement.totalTokens,
        eventAt: (seq) => agent.session.eventAt(seq),
      };
    },
    log: (message) => ctx.logger.info(message),
  });
  return botTurnTelemetry;
}

export { mountClientDiagnostics } from '../../diagnostics/client-diagnostics.js';
