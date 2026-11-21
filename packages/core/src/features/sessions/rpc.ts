import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { TurnTrace } from '../../bots/tool-trace.js';
import type { SessionTranscript } from '../../runtime/session-transcript.js';
import type { SessionToolDetail } from '../../runtime/session-tool-detail.js';
import type { SessionRootRole } from '../../sessions/ownership.js';
import type { ManualCompactionResult } from '../../runtime/idle-compaction.js';
import type {
  IdleCompactionView,
  OwnedSessionSummary,
  OwnedSessionBot,
  SessionsBridgeMethods,
} from './methods.js';

export function botNewSession(
  methods: SessionsBridgeMethods,
  slug: string,
): Promise<{ started: true }> {
  return unwrapAsync(methods.botNewSession({ slug }));
}

export function botCompact(
  methods: SessionsBridgeMethods,
  slug: string,
): Promise<ManualCompactionResult> {
  return unwrapAsync(methods.botCompact({ slug }));
}

export function botContext(
  methods: SessionsBridgeMethods,
  slug: string,
): Promise<import('../../runtime/context-window.js').BotContextWindow> {
  return unwrapAsync(methods.botContext({ slug }));
}

export function channelBotStop(
  methods: SessionsBridgeMethods,
  channelId: string,
  botSlug: string,
  autoContinueFor?: string,
): Promise<{
  stopped: { botSlug: string; sessionId: string; messageId: string };
}> {
  return unwrapAsync(
    methods.channelBotStop({
      channelId,
      botSlug,
      ...(autoContinueFor === undefined ? {} : { autoContinueFor }),
    }),
  );
}

export function botStop(
  methods: SessionsBridgeMethods,
  botSlug: string,
  channelId?: string,
  autoContinueFor?: string,
): Promise<{
  stopped: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
  alreadyIdle: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
  messageId?: string;
}> {
  return unwrapAsync(
    methods.botStop({
      botSlug,
      ...(channelId === undefined ? {} : { channelId }),
      ...(autoContinueFor === undefined ? {} : { autoContinueFor }),
    }),
  );
}

export function sessionStop(
  methods: SessionsBridgeMethods,
  botSlug: string,
  sessionId?: string,
  channelId?: string,
  activityId?: string,
): Promise<{
  stopped: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
  alreadyIdle: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
  messageId?: string;
}> {
  return unwrapAsync(
    methods.sessionStop({
      botSlug,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(channelId === undefined ? {} : { channelId }),
      ...(activityId === undefined ? {} : { activityId }),
    }),
  );
}

export function idleCompaction(methods: SessionsBridgeMethods): IdleCompactionView {
  return unwrap(methods.idleCompaction({}));
}

export function idleCompactionSet(
  methods: SessionsBridgeMethods,
  enabled: boolean,
): IdleCompactionView {
  return unwrap(methods.idleCompactionSet({ enabled }));
}

export function idleCompactionCacheLifetimeSet(
  methods: SessionsBridgeMethods,
  provider: string,
  model: string,
  seconds: number | null,
): IdleCompactionView {
  return unwrap(methods.idleCompactionCacheLifetimeSet({ provider, model, seconds }));
}

export function compactionThresholdSet(
  methods: SessionsBridgeMethods,
  thresholdRatio?: number | null,
  headroomTokens?: number | null,
): IdleCompactionView {
  return unwrap(
    methods.compactionThresholdSet({
      ...(thresholdRatio === undefined ? {} : { thresholdRatio }),
      ...(headroomTokens === undefined ? {} : { headroomTokens }),
    }),
  );
}

export function sessionTranscript(
  methods: SessionsBridgeMethods,
  slug: string,
  sessionId: string,
): Promise<{ sessionId: string; role: SessionRootRole } & SessionTranscript> {
  return unwrapAsync(methods.sessionTranscript({ slug, sessionId }));
}

export function sessionToolDetail(
  methods: SessionsBridgeMethods,
  slug: string,
  sessionId: string,
  callId: string,
): Promise<{ sessionId: string; callId: string; detail: SessionToolDetail }> {
  return unwrapAsync(methods.sessionToolDetail({ slug, sessionId, callId }));
}

export function botToolTrace(
  methods: SessionsBridgeMethods,
  slug: string,
  sessionId?: string,
  turns?: number,
): Promise<{ slug: string; sessionId: string; turns: TurnTrace[] }> {
  return unwrapAsync(
    methods.botToolTrace({
      slug,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(turns === undefined ? {} : { turns }),
    }),
  );
}

export function sessions(
  methods: SessionsBridgeMethods,
  slug: string,
): { sessions: OwnedSessionSummary[] } {
  return unwrap(methods.sessions({ slug }));
}

export function sessionArchiveSet(
  methods: SessionsBridgeMethods,
  slug: string,
  sessionId: string,
  archived: boolean,
): Promise<{ archived: boolean }> {
  return unwrapAsync(methods.sessionArchiveSet({ slug, sessionId, archived }));
}

export function sessionOwner(
  methods: SessionsBridgeMethods,
  sessionId: string,
): { owner: OwnedSessionBot | null } {
  return unwrap(methods.sessionOwner({ sessionId }));
}

export function botSessionIds(methods: SessionsBridgeMethods): {
  sessionIds: string[];
  groups: { botSlug: string; displayName: string; sessionIds: string[] }[];
} {
  return unwrap(methods.botSessionIds({}));
}
