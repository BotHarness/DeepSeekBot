import {
  sessionModelChoice,
  type SessionModelChoice,
  type SessionModelState,
} from '@botharness/host-protocol/session-model';
import { sessionRouteChoice } from '../../runtime/session-model-choices.js';
import { routingGroupFailure, type createModelRoutingHelpers } from '../models/routing.js';
import { EngineRefusal } from '../../engines/engine-session.js';
import {
  asNonBlank,
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  unknownChannel,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { sessionTarget } from '../../bridge/session-target.js';
import { type HumanContext } from '../../humans/context.js';
import { SessionRecoveryError } from '../../runtime/session-recovery.js';
import type { BotContextWindow } from '../../runtime/context-window.js';
import {
  MIN_IDLE_MS,
  type IdleCompaction,
  type IdleCompactionRouteView,
  type ManualCompactionResult,
} from '../../runtime/idle-compaction.js';
import {
  COMPACTION_HEADROOM_TOKENS,
  COMPACTION_THRESHOLD_RATIO,
  isCacheLifetimeSeconds,
  isCompactionHeadroomTokens,
  isCompactionThresholdRatio,
  MAX_CACHE_LIFETIME_SECONDS,
  type IdleCompactionRoute,
  type IdleCompactionSettings,
} from '../../runtime/idle-compaction-settings.js';
import { directToolTrace, summarizeToolTrace, type TurnTrace } from '../../bots/tool-trace.js';
import type { ChannelTurnStopTarget } from '../../channels/channel.js';
import {
  summarizeSessionTranscript,
  type SessionTranscript,
} from '../../runtime/session-transcript.js';
import {
  summarizeSessionToolDetail,
  type SessionToolDetail,
} from '../../runtime/session-tool-detail.js';
import { randomUUID } from 'node:crypto';
import { type ChannelRecord } from '../../channels/channel.js';
import { botAvatarUrl } from '../../bots/avatar-http.js';
import type { AvatarAppearance, RetainedAvatarAppearance } from '../../bots/avatar-appearance.js';
import type { SessionRootRole } from '../../sessions/ownership.js';
import { DEFAULT_MODEL_PRESET_ID, type ModelRoute } from '../../models/presets.js';
import type { AssignmentAccessMode } from '../../workspaces/assignment-access.js';
import type { AssignmentActivity, AssignmentReportState } from '../../runtime/bot-runtime.js';
import type { AssignmentExecutionWait } from '../../runtime/assignment-approval-capacity.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface SessionsBridgeMethods {
  botNewSession(payload: unknown): Promise<BridgeResult<{ started: true }>>;
  botCompact(payload: unknown): Promise<BridgeResult<ManualCompactionResult>>;
  botContext(payload: unknown): Promise<BridgeResult<BotContextWindow>>;
  channelBotStop(payload: unknown): Promise<
    BridgeResult<{
      stopped: { botSlug: string; sessionId: string; messageId: string };
    }>
  >;
  botStop(payload: unknown): Promise<
    BridgeResult<{
      stopped: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
      alreadyIdle: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
      messageId?: string;
    }>
  >;
  sessionStop(payload: unknown): Promise<
    BridgeResult<{
      stopped: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
      alreadyIdle: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
      messageId?: string;
    }>
  >;
  idleCompaction(payload?: unknown): BridgeResult<IdleCompactionView>;
  idleCompactionSet(payload: unknown): BridgeResult<IdleCompactionView>;
  idleCompactionCacheLifetimeSet(payload: unknown): BridgeResult<IdleCompactionView>;
  compactionThresholdSet(payload: unknown): BridgeResult<IdleCompactionView>;
  sessionModel(payload: unknown): Promise<BridgeResult<SessionModelState>>;
  sessionTranscript(
    payload: unknown,
  ): Promise<
    BridgeResult<
      { sessionId: string; role: SessionRootRole; currentTarget?: TurnTarget } & SessionTranscript
    >
  >;
  sessionToolDetail(
    payload: unknown,
  ): Promise<BridgeResult<{ sessionId: string; callId: string; detail: SessionToolDetail }>>;
  botToolTrace(
    payload: unknown,
  ): Promise<BridgeResult<{ slug: string; sessionId: string; turns: TurnTrace[] }>>;
  sessions(payload: unknown): BridgeResult<{ sessions: OwnedSessionSummary[] }>;
  sessionArchiveSet(payload: unknown): Promise<BridgeResult<{ archived: boolean }>>;
  sessionOwner(payload: unknown): BridgeResult<{ owner: OwnedSessionBot | null }>;
  botSessionIds(payload: unknown): BridgeResult<{
    sessionIds: string[];
    groups: { botSlug: string; displayName: string; sessionIds: string[] }[];
  }>;
}

export interface IdleCompactionView {
  enabled: boolean;
  settingReadable: boolean;
  minimumIdleSeconds: number;
  scheduled: number;
  routes: IdleCompactionRouteView[];
  threshold: {
    ratio: number;
    headroomTokens: number;
    ratioSet: boolean;
    headroomSet: boolean;
    ratioRange: { defaultValue: number; min: number; max: number };
    headroomRange: { defaultValue: number; min: number; max: number };
  };
}

export interface IdleCompactionDeps {
  settings: IdleCompactionSettings;
  scheduler: Pick<IdleCompaction, 'describe' | 'scheduled'>;
  routes(): IdleCompactionRoute[];
  rescan(): void;
  applyThreshold?(): void;
  compactBot?(slug: string): Promise<ManualCompactionResult>;
  compactReservedSession?(sessionId: string): Promise<ManualCompactionResult>;
}

function idleCompactionView(deps: IdleCompactionDeps): IdleCompactionView {
  const setting = deps.settings.read();
  return {
    enabled: setting !== 'invalid' && setting.enabled,
    settingReadable: setting !== 'invalid',
    minimumIdleSeconds: MIN_IDLE_MS / 1000,
    scheduled: deps.scheduler.scheduled(),
    routes: deps.scheduler.describe(deps.routes()),
    threshold: {
      ratio:
        (setting === 'invalid' ? undefined : setting.thresholdRatio) ??
        COMPACTION_THRESHOLD_RATIO.defaultValue,
      headroomTokens:
        (setting === 'invalid' ? undefined : setting.headroomTokens) ??
        COMPACTION_HEADROOM_TOKENS.defaultValue,
      ratioSet: setting !== 'invalid' && setting.thresholdRatio !== undefined,
      headroomSet: setting !== 'invalid' && setting.headroomTokens !== undefined,
      ratioRange: COMPACTION_THRESHOLD_RATIO,
      headroomRange: COMPACTION_HEADROOM_TOKENS,
    },
  };
}

export interface SessionEngineQuota {
  usedPercent?: number;
  resetsAt?: string;
  limitedUntil?: string;
  observedAt: string;
}

export interface OwnedSessionSummary {
  sessionId: string;
  role: SessionRootRole;
  createdAt: string;
  cwdReference?: string;
  assignmentActivity?: AssignmentActivity;
  assignmentAccessMode?: AssignmentAccessMode;
  assignmentReportState?: AssignmentReportState;
  assignmentExecutionWait?: AssignmentExecutionWait;
  assignmentArchived?: true;
  assignmentTitle?: string;
  assignmentDescription?: string;
  assignmentModelRoute?: ModelRoute;
  modelRoute?: ModelRoute;
  engine?: { engine: string; account?: string; quota?: SessionEngineQuota };
  currentTarget?: TurnTarget;
  agentPreset?: string;
  currentOrchestrator?: boolean;
  triageOpenCount?: number;
  subagentCount?: number;
}

export interface OwnedSessionBot {
  botSlug: string;
  displayName: string;
  avatar?: string;
  appearance?: AvatarAppearance | RetainedAvatarAppearance;
  avatarSeed?: 2;
  role: SessionRootRole;
}

export function createSessionsBridgeMethods(
  human: HumanContext,
  deps: Pick<
    BridgeMethodsDeps,
    | 'botContext'
    | 'sessionModels'
    | 'engineSelection'
    | 'routingGroups'
    | 'modelCatalog'
    | 'subscriptionEngines'
    | 'channels'
    | 'defaultModel'
    | 'modelPresets'
    | 'describeEngineSession'
    | 'describeToolCall'
    | 'idleCompaction'
    | 'ownership'
    | 'presentToolResult'
    | 'readUsageSessionLog'
    | 'registry'
    | 'runtime'
    | 'states'
    | 'team'
    | 'usage'
  >,
  botInChannel: (channel: ChannelRecord, botSlug: string) => boolean,
  routing: ReturnType<typeof createModelRoutingHelpers>,
): SessionsBridgeMethods {
  async function appendStopNotice(
    channelId: string,
    botSlug: string,
    botName: string,
    sessionId: string,
    target: ChannelTurnStopTarget,
  ): Promise<string | undefined> {
    const humanName =
      deps.channels
        .listHumanMembers(human, channelId)
        .find((member) => member.humanId === human.humanId)?.displayName ?? 'Human';
    const subject =
      target.scope === 'bot'
        ? botName
        : target.role === 'orchestrator'
          ? `${botName}'s Orchestrator`
          : `${botName}'s Assignment${target.title ? ` “${target.title}”` : ''}`;
    const appended = await deps.channels.appendMessage(human, channelId, {
      id: `turn-stopped-${randomUUID()}`,
      at: new Date().toISOString(),
      author: { kind: 'system' },
      body: `${humanName} stopped ${subject}.`,
      turnStop: {
        botSlug,
        botName,
        humanName,
        sessionId,
        cause: 'human-stop',
        target,
      },
    });
    return appended?.id;
  }
  async function stopBotSessions(
    source: Record<string, unknown>,
    botSlug: string,
    channelId: string | undefined,
  ): Promise<
    BridgeResult<{
      stopped: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
      alreadyIdle: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
      messageId?: string;
    }>
  > {
    const bot = deps.registry.get(botSlug);
    if (bot === undefined) return unknownBot(botSlug);
    const autoContinueFor = asNonBlank(source, 'autoContinueFor');
    if (source['autoContinueFor'] !== undefined && autoContinueFor === undefined)
      return invalidInput('autoContinueFor must be a message id');
    if (autoContinueFor !== undefined) {
      if (channelId === undefined) return invalidInput('autoContinueFor needs a channelId');
      const cancelled = await deps.runtime?.stopTurn?.(botSlug, {
        autoContinueFor,
        channelId,
      });
      if (cancelled === undefined) return { ok: true, value: { stopped: [], alreadyIdle: [] } };
      const humanName =
        deps.channels
          .listHumanMembers(human, channelId)
          .find((member) => member.humanId === human.humanId)?.displayName ?? 'Human';
      const appended = await deps.channels.appendMessage(human, channelId, {
        id: `turn-stopped-${randomUUID()}`,
        at: new Date().toISOString(),
        author: { kind: 'system' },
        body: `${humanName} stopped ${bot.displayName}.`,
        turnStop: {
          botSlug,
          botName: bot.displayName,
          humanName,
          sessionId: cancelled.sessionId,
        },
      });
      return {
        ok: true,
        value: {
          stopped: [{ botSlug, sessionId: cancelled.sessionId, role: 'orchestrator' }],
          alreadyIdle: [],
          ...(appended === undefined ? {} : { messageId: appended.id }),
        },
      };
    }
    if (deps.runtime?.stopAllSessions === undefined) return unavailable();
    const outcome = await deps.runtime.stopAllSessions(botSlug);
    const channel = channelId === undefined ? undefined : deps.channels.get(channelId);
    const noticeSession =
      outcome.stopped.find((ref) => ref.role === 'orchestrator')?.sessionId ??
      outcome.stopped[0]?.sessionId;
    const messageId =
      noticeSession !== undefined &&
      channel !== undefined &&
      !channel.deletedAt &&
      botInChannel(channel, botSlug)
        ? await appendStopNotice(channel.id, botSlug, bot.displayName, noticeSession, {
            scope: 'bot',
          })
        : undefined;
    return {
      ok: true,
      value: {
        stopped: outcome.stopped,
        alreadyIdle: outcome.alreadyIdle,
        ...(messageId === undefined ? {} : { messageId }),
      },
    };
  }
  return {
    async botNewSession(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.runtime?.startFreshOrchestrator === undefined) return unavailable();
      try {
        const outcome = await deps.runtime.startFreshOrchestrator(slug);
        if (outcome === 'busy')
          return {
            ok: false,
            error: {
              code: 'bot-busy',
              message: 'Stop the Bot before starting a fresh Session',
            },
          };
        return { ok: true, value: { started: true } };
      } catch {
        return {
          ok: false,
          error: {
            code: 'session-reset-failed',
            message: 'Could not start a fresh Session',
          },
        };
      }
    },
    async botCompact(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.idleCompaction?.compactBot === undefined) return unavailable();
      try {
        const result = await deps.idleCompaction.compactBot(slug);
        if (result.outcome === 'busy')
          return {
            ok: false,
            error: {
              code: 'bot-busy',
              message: 'Stop the Bot before compacting its Session',
            },
          };
        return { ok: true, value: result };
      } catch (error) {
        if (error instanceof SessionRecoveryError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        return {
          ok: false,
          error: {
            code: 'compaction-failed',
            message: 'Could not compact the Session',
          },
        };
      }
    },
    async botContext(payload) {
      const slug = asSlug(payload);
      if (!slug) return invalidInput('slug is required');
      if (!deps.registry.get(slug)) return unknownBot(slug);
      if (!deps.botContext) return unavailable();
      try {
        return { ok: true, value: await deps.botContext(slug) };
      } catch {
        return unavailable();
      }
    },
    async channelBotStop(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const botSlug = asNonBlank(source, 'botSlug');
      if (!channelId || !botSlug) return invalidInput('channelId and botSlug are required');
      const channel = deps.channels.get(channelId);
      if (channel === undefined || channel.deletedAt) return unknownChannel(channelId);
      const bot = deps.registry.get(botSlug);
      if (bot === undefined) return unknownBot(botSlug);
      if (!botInChannel(channel, botSlug))
        return invalidInput(`${bot.displayName} is not in this Channel`);
      const stopped = await stopBotSessions(source, botSlug, channelId);
      if (!stopped.ok) return stopped;
      if (stopped.value.messageId === undefined)
        return {
          ok: false,
          error: {
            code: 'not-working',
            message: `${bot.displayName} is not working right now`,
          },
        };
      const sessionId =
        stopped.value.stopped.find((ref) => ref.role === 'orchestrator')?.sessionId ??
        stopped.value.stopped[0]!.sessionId;
      return {
        ok: true,
        value: {
          stopped: { botSlug, sessionId, messageId: stopped.value.messageId },
        },
      };
    },
    async botStop(payload) {
      const source = asObject(payload);
      const botSlug = asNonBlank(source, 'botSlug');
      if (!botSlug) return invalidInput('botSlug is required');
      if (deps.registry.get(botSlug) === undefined) return unknownBot(botSlug);
      const channelId = asNonBlank(source, 'channelId');
      if (source['channelId'] !== undefined && channelId === undefined)
        return invalidInput('channelId must be a Channel id');
      if (channelId !== undefined) {
        const channel = deps.channels.get(channelId);
        if (channel === undefined || channel.deletedAt) return unknownChannel(channelId);
      }
      return stopBotSessions(source, botSlug, channelId);
    },
    async sessionStop(payload) {
      const source = asObject(payload);
      const botSlug = asNonBlank(source, 'botSlug');
      const activityId = asNonBlank(source, 'activityId');
      if (!botSlug || (source['sessionId'] === undefined) === (activityId === undefined))
        return invalidInput('botSlug and exactly one of sessionId or activityId are required');
      const bot = deps.registry.get(botSlug);
      if (bot === undefined) return unknownBot(botSlug);
      const channelId = asNonBlank(source, 'channelId');
      if (source['channelId'] !== undefined && channelId === undefined)
        return invalidInput('channelId must be a Channel id');
      if (deps.runtime?.stopSession === undefined) return unavailable();
      const sessionId =
        activityId === undefined
          ? asNonBlank(source, 'sessionId')
          : deps.states.sessionIdForActivity(botSlug, activityId);
      if (activityId !== undefined && sessionId === undefined)
        return { ok: true, value: { stopped: [], alreadyIdle: [] } };
      if (!sessionId) return invalidInput('sessionId must be a Session id');
      const outcome = await deps.runtime.stopSession(botSlug, sessionId);
      if (outcome.outcome === 'refused')
        return {
          ok: false,
          error: { code: outcome.code, message: outcome.message },
        };
      const ref = outcome.stopped[0];
      const channel = channelId === undefined ? undefined : deps.channels.get(channelId);
      const related =
        ref !== undefined &&
        channel !== undefined &&
        !channel.deletedAt &&
        (ref.role === 'orchestrator'
          ? botInChannel(channel, botSlug)
          : (deps.runtime.listChannelAssignments?.(channel.id) ?? []).some(
              (assignment) => assignment.sessionId === ref.sessionId,
            ));
      const title =
        ref?.role === 'assignment'
          ? deps.runtime.getAssignment(botSlug, ref.sessionId)?.title
          : undefined;
      const messageId = related
        ? await appendStopNotice(channel!.id, bot.slug, bot.displayName, ref.sessionId, {
            scope: 'session',
            role: ref.role,
            sessionId: ref.sessionId,
            ...(title ? { title } : {}),
          })
        : undefined;
      return {
        ok: true,
        value: {
          stopped: outcome.stopped,
          alreadyIdle: outcome.alreadyIdle,
          ...(messageId === undefined ? {} : { messageId }),
        },
      };
    },
    idleCompaction() {
      if (deps.idleCompaction === undefined) return unavailable();
      return { ok: true, value: idleCompactionView(deps.idleCompaction) };
    },
    idleCompactionSet(payload) {
      if (deps.idleCompaction === undefined) return unavailable();
      const enabled = asObject(payload)['enabled'];
      if (typeof enabled !== 'boolean') return invalidInput('enabled must be true or false');
      try {
        deps.idleCompaction.settings.setEnabled(enabled);
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
      if (enabled) deps.idleCompaction.rescan();
      return { ok: true, value: idleCompactionView(deps.idleCompaction) };
    },
    idleCompactionCacheLifetimeSet(payload) {
      if (deps.idleCompaction === undefined) return unavailable();
      const object = asObject(payload);
      const provider = asNonBlank(object, 'provider');
      const model = asNonBlank(object, 'model');
      const lifetime = object['seconds'];
      if (provider === undefined || model === undefined)
        return invalidInput('provider and model are required');
      if (lifetime !== null && !isCacheLifetimeSeconds(lifetime))
        return invalidInput(
          `seconds must be a whole number from 0 to ${MAX_CACHE_LIFETIME_SECONDS}, or null to resolve it automatically`,
        );
      try {
        deps.idleCompaction.settings.setCacheLifetime({ provider, model }, lifetime);
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
      deps.idleCompaction.rescan();
      return { ok: true, value: idleCompactionView(deps.idleCompaction) };
    },
    compactionThresholdSet(payload) {
      if (deps.idleCompaction === undefined) return unavailable();
      const object = asObject(payload);
      const ratio = object['thresholdRatio'];
      const headroom = object['headroomTokens'];
      if (
        (ratio === undefined && headroom === undefined) ||
        (ratio !== undefined && ratio !== null && !isCompactionThresholdRatio(ratio)) ||
        (headroom !== undefined && headroom !== null && !isCompactionHeadroomTokens(headroom))
      )
        return invalidInput(
          `thresholdRatio (${COMPACTION_THRESHOLD_RATIO.min}-${COMPACTION_THRESHOLD_RATIO.max}) and/or headroomTokens (integer ${COMPACTION_HEADROOM_TOKENS.min}-${COMPACTION_HEADROOM_TOKENS.max}) are required; null restores the default`,
        );
      try {
        deps.idleCompaction.settings.setThreshold({
          ...(ratio === undefined ? {} : { thresholdRatio: ratio as number | null }),
          ...(headroom === undefined ? {} : { headroomTokens: headroom as number | null }),
        });
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
      deps.idleCompaction.applyThreshold?.();
      deps.idleCompaction.rescan();
      return { ok: true, value: idleCompactionView(deps.idleCompaction) };
    },
    async sessionModel(payload) {
      const input = asObject(payload);
      const slug = asSlug(payload);
      const sessionId = asNonBlank(input, 'sessionId');
      if (slug === undefined || sessionId === undefined)
        return invalidInput('slug and sessionId are required');
      const bot = deps.registry.get(slug);
      if (bot === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return { ok: false, error: { code: 'not-found', message: 'Unknown root Session' } };
      const store = deps.sessionModels;
      if (store === undefined) return unavailable();
      const proposed = input['choice'];
      if (proposed !== undefined) {
        const choice = proposed === null ? null : sessionModelChoice(proposed);
        if (choice === undefined) return invalidInput('Invalid Session Model Choice');
        try {
          const requireChoice = () => {
            deps.team?.roles.require(human, 'models.use');
            if (choice?.kind === 'group') {
              routing.requireRoutes(slug, routing.groupRoutes(choice.id));
              routing.requireGroupEngines(choice.id, slug);
            } else if (choice?.kind === 'engine') {
              routing.requireEngineChoices([choice], slug);
              routing.assertEngineAccounts([choice]);
            } else if (choice?.kind === 'model') {
              const { provider, model, effort } = choice;
              routing.requireRoutes(slug, [
                { provider, model, ...(effort === undefined ? {} : { reasoningEffort: effort }) },
              ]);
            }
          };
          requireChoice();
          if (choice?.kind === 'engine') {
            if (deps.subscriptionEngines === undefined)
              throw new EngineRefusal('engine-unavailable', 'Subscription Engines are unavailable');
            await deps.subscriptionEngines.validateChoice(choice.engine, choice);
          } else if (choice?.kind === 'model') {
            if (deps.modelCatalog === undefined) return unavailable();
            const { provider, model, effort } = choice;
            await deps.modelCatalog.validate({
              provider,
              model,
              ...(effort === undefined ? {} : { reasoningEffort: effort }),
            });
          } else if (choice?.kind === 'group') {
            await routing.requireGroupEfforts(
              choice.id,
              choice.effort === undefined ? [] : [choice.effort],
            );
          }
          requireChoice();
          if (
            deps.ownership.resolve(sessionId)?.botSlug !== slug ||
            deps.registry.get(slug) === undefined
          )
            return unknownBot(slug);
          store.set(sessionId, choice);
        } catch (error) {
          return routingGroupFailure(error);
        }
      }
      const role = owner.rootRole;
      const plan = bot.modelPlan;
      const engine = deps.engineSelection?.store
        .selections()
        .find((entry) => entry.botSlug === slug && entry.role === role);
      const defaultPreset = deps.modelPresets?.get(DEFAULT_MODEL_PRESET_ID);
      const inherited =
        defaultPreset === undefined
          ? undefined
          : {
              groupId: defaultPreset.orchestratorGroupId,
              effort: defaultPreset.orchestratorGroupEffort,
            };
      const assignment =
        role === 'assignment' ? deps.runtime?.getAssignment(slug, sessionId) : undefined;
      const group =
        role === 'assignment'
          ? (assignment?.modelGroupId ?? plan?.assignmentDefaultGroupId)
          : plan === undefined
            ? inherited?.groupId
            : plan.orchestratorGroupId;
      const groupEffort =
        role === 'orchestrator'
          ? plan === undefined
            ? inherited?.effort
            : plan.orchestratorGroupEffort
          : assignment?.modelGroupEffort;
      const route =
        (role === 'assignment'
          ? (assignment?.modelRoute ?? plan?.assignmentDefault)
          : plan?.orchestrator) ??
        defaultPreset?.orchestrator ??
        deps.defaultModel?.currentSelection() ??
        deps.modelCatalog?.defaultRoute?.();
      const defaultChoice: SessionModelChoice | null =
        engine !== undefined
          ? (sessionModelChoice({ ...engine, kind: 'engine', model: engine.model ?? 'default' }) ??
            null)
          : group !== undefined
            ? {
                kind: 'group',
                id: group,
                ...(groupEffort === undefined ? {} : { effort: groupEffort }),
              }
            : route === undefined
              ? null
              : sessionRouteChoice(route);
      const active = deps.runtime?.activeSessionModel?.(sessionId);
      return {
        ok: true,
        value: {
          override: store.get(sessionId),
          default: defaultChoice,
          ...(active === undefined ? {} : { active }),
        },
      };
    },
    async sessionTranscript(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown root Session: ${sessionId}` },
        };
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const log = await read(sessionId);
      const engine = deps.describeEngineSession?.(sessionId);
      const segments = deps.runtime?.sessionTurnTargets?.(sessionId) ?? [];
      const currentTarget = sessionTarget(segments.at(-1)?.target, engine);
      return {
        ok: true,
        value: {
          sessionId,
          role: owner.rootRole,
          ...(engine === undefined || currentTarget?.kind === 'dsh' ? {} : { engine }),
          ...(currentTarget === undefined ? {} : { currentTarget }),
          ...summarizeSessionTranscript({
            sessionId,
            events: log?.events ?? [],
            segments,
            describe: (id, name, args) => deps.describeToolCall?.(id, name, args),
          }),
        },
      };
    },
    async sessionToolDetail(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      const callId = asNonBlank(source, 'callId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (callId === undefined) return invalidInput('callId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown root Session: ${sessionId}` },
        };
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const log = await read(sessionId);
      const detail = summarizeSessionToolDetail({
        sessionId,
        callId,
        events: log?.events ?? [],
        ...(deps.presentToolResult === undefined ? {} : { present: deps.presentToolResult }),
      });
      if (detail === undefined)
        return { ok: false, error: { code: 'not-found', message: `unknown tool call: ${callId}` } };
      return { ok: true, value: { sessionId, callId, detail } };
    },
    async botToolTrace(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const source = asObject(payload) ?? {};
      const turns = source['turns'] === undefined ? 3 : source['turns'];
      if (typeof turns !== 'number' || !Number.isInteger(turns) || turns < 1 || turns > 20)
        return invalidInput('turns must be an integer from 1 to 20');
      const roots = deps.ownership.rootsFor(slug);
      const requested = source['sessionId'];
      if (requested !== undefined && typeof requested !== 'string')
        return invalidInput('sessionId must be a string');
      if (requested === 'direct')
        return {
          ok: true,
          value: {
            slug,
            sessionId: 'direct',
            turns: directToolTrace(deps.runtime?.directBotToolCalls?.(slug) ?? [], { turns }),
          },
        };
      const sessionId =
        requested ??
        deps.runtime?.currentOrchestratorSessionId?.(slug) ??
        [...roots].reverse().find((root) => root.rootRole === 'orchestrator')?.sessionId;
      if (sessionId === undefined || !roots.some((root) => root.sessionId === sessionId))
        return invalidInput('The Session does not belong to this PersonaBot');
      if (deps.readUsageSessionLog === undefined) return unavailable();
      const log = await deps.readUsageSessionLog(sessionId);
      if (log === undefined) return unavailable();
      return {
        ok: true,
        value: {
          slug,
          sessionId,
          ...summarizeToolTrace(log.events, { turns }),
        },
      };
    },
    sessions(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const assignments = new Map(
        (deps.runtime?.listAssignments(slug) ?? []).map((assignment) => [
          assignment.sessionId,
          assignment,
        ]),
      );
      const resumed =
        deps.runtime?.currentOrchestratorSessionId === undefined
          ? undefined
          : (deps.runtime.currentOrchestratorSessionId(slug) ?? null);
      const triage = deps.runtime?.triageOpenCount?.(slug);
      const roots = deps.ownership.rootsFor(slug);
      const subagentCounts = deps.ownership.subagentCounts(roots.map((root) => root.sessionId));
      const plan = deps.registry.get(slug)?.modelPlan;
      const sessions = roots.map((root) => {
        const assignment = assignments.get(root.sessionId);
        const subagentCount = subagentCounts.get(root.sessionId);
        const described = deps.describeEngineSession?.(root.sessionId);
        const currentTarget = sessionTarget(
          deps.runtime?.sessionTurnTarget?.(root.sessionId),
          described,
        );
        const engine = currentTarget?.kind === 'dsh' ? undefined : described;
        const modelRoute =
          engine !== undefined || currentTarget?.kind === 'engine'
            ? undefined
            : (deps.usage?.latestRoute(root.sessionId) ??
              (root.rootRole === 'assignment'
                ? (assignment?.modelRoute ?? plan?.assignmentDefault)
                : plan?.orchestrator) ??
              deps.defaultModel?.currentSelection(root.rootRole));
        return {
          sessionId: root.sessionId,
          role: root.rootRole,
          createdAt: root.createdAt,
          ...(resumed === undefined || root.rootRole !== 'orchestrator'
            ? {}
            : { currentOrchestrator: root.sessionId === resumed }),
          ...(triage === undefined || root.rootRole !== 'orchestrator' || root.sessionId !== resumed
            ? {}
            : { triageOpenCount: triage }),
          ...(root.cwdReference === undefined ? {} : { cwdReference: root.cwdReference }),
          ...(assignment === undefined ? {} : { assignmentActivity: assignment.activity }),
          ...(assignment?.permission === undefined
            ? {}
            : { assignmentAccessMode: assignment.permission.mode }),
          ...(assignment?.latestReport === undefined
            ? {}
            : { assignmentReportState: assignment.latestReport.state }),
          ...(assignment?.executionWait === undefined
            ? {}
            : { assignmentExecutionWait: assignment.executionWait }),
          ...(assignment?.archivedAt === undefined ? {} : { assignmentArchived: true as const }),
          ...(assignment === undefined
            ? {}
            : {
                assignmentTitle: assignment.title,
                assignmentDescription: assignment.description,
              }),
          ...(assignment?.modelRoute === undefined
            ? {}
            : { assignmentModelRoute: assignment.modelRoute }),
          ...(modelRoute === undefined ? {} : { modelRoute }),
          ...(currentTarget === undefined ? {} : { currentTarget }),
          ...(engine === undefined
            ? {}
            : {
                engine: {
                  engine: engine.engine,
                  ...(engine.account === undefined ? {} : { account: engine.account }),
                  ...(engine.quota === undefined ? {} : { quota: engine.quota }),
                },
              }),
          ...(root.agentPreset === undefined ? {} : { agentPreset: root.agentPreset }),
          ...(subagentCount === undefined ? {} : { subagentCount }),
        };
      });
      return { ok: true, value: { sessions } };
    },
    async sessionArchiveSet(payload) {
      const input = asObject(payload);
      const slug = asSlug(payload);
      const sessionId = asNonBlank(input, 'sessionId');
      const archived = input?.['archived'];
      if (slug === undefined || sessionId === undefined || typeof archived !== 'boolean')
        return invalidInput('slug, sessionId and archived are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.runtime?.setAssignmentArchived === undefined)
        return invalidInput('Assignment archive is unavailable');
      if (deps.runtime.getAssignment(slug, sessionId) === undefined)
        return invalidInput('Unknown Assignment Session');
      const outcome = await deps.runtime.setAssignmentArchived(slug, sessionId, archived);
      if (outcome.outcome === 'refused') return invalidInput(outcome.message);
      return { ok: true, value: { archived: outcome.outcome === 'archived' } };
    },
    sessionOwner(payload) {
      const sessionId = asNonBlank(asObject(payload), 'sessionId');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      const owned = deps.ownership.resolve(sessionId);
      if (owned === undefined || owned.parentSessionId !== undefined)
        return { ok: true, value: { owner: null } };
      const bot = deps.registry.get(owned.botSlug);
      if (bot === undefined) return { ok: true, value: { owner: null } };
      return {
        ok: true,
        value: {
          owner: {
            botSlug: bot.slug,
            displayName: bot.displayName,
            ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
            ...(bot.avatar === undefined
              ? {}
              : {
                  avatar: bot.avatar.startsWith('data:image/')
                    ? botAvatarUrl(bot.slug, bot.avatar)
                    : bot.avatar,
                }),
            role: owned.rootRole,
          },
        },
      };
    },
    botSessionIds() {
      const privateSessions = deps.team?.bots.privateSessions(human);
      const groups = deps.registry
        .list()
        .filter((bot) => !privateSessions?.has(bot.slug))
        .map((bot) => ({
          botSlug: bot.slug,
          displayName: bot.displayName,
          sessionIds: deps.ownership
            .rootsFor(bot.slug)
            .filter((root) => deps.ownership.contentAvailable(root.sessionId))
            .map((root) => root.sessionId),
        }));
      return {
        ok: true,
        value: {
          sessionIds: groups.flatMap((group) => group.sessionIds),
          groups,
        },
      };
    },
  };
}

export interface SessionsAdapterMethods {
  sessionMessageSend(payload: unknown): Promise<BridgeResult<{ sourceEventId: string }>>;
}

export function createSessionsAdapterMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
): SessionsAdapterMethods {
  return {
    async sessionMessageSend(payload) {
      const source = asObject(payload);
      const botSlug = asNonBlank(source, 'botSlug');
      const sessionId = asNonBlank(source, 'sessionId');
      const text = typeof source['text'] === 'string' ? source['text'] : undefined;
      if (!botSlug || !sessionId || text === undefined || text.trim() === '')
        return invalidInput('botSlug, sessionId and a non-blank text are required');
      if (deps.registry.get(botSlug) === undefined) return unknownBot(botSlug);
      if (deps.runtime?.sendOrchestratorMessage === undefined) return unavailable();
      const outcome = deps.runtime.sendOrchestratorMessage(human, {
        botSlug,
        sessionId,
        text,
      });
      if (!outcome.delivered)
        return {
          ok: false,
          error: {
            code: outcome.reason === 'not-current-orchestrator' ? 'invalid-input' : 'unavailable',
            message:
              outcome.reason === 'not-current-orchestrator'
                ? "Only the Bot's current Orchestrator Session accepts a direct message"
                : `The message was not delivered: ${outcome.reason}`,
          },
        };
      void outcome.settled.catch(() => undefined);
      return { ok: true, value: { sourceEventId: outcome.sourceEventId } };
    },
  };
}
