import type { SessionLiveSnapshot } from '../../runtime/session-live.js';
import type { BridgeMethods, OwnedSessionSummary } from '../../bridge/methods.js';
import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import type { SessionModelState } from '@botharness/host-protocol/session-model';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { TurnTrace } from '../../bots/tool-trace.js';
import type { SessionToolDetail } from '../../runtime/session-tool-detail.js';
import type { ManualCompactionResult } from '../../runtime/idle-compaction.js';
import type { IdleCompactionView, OwnedSessionBot, SessionsBridgeMethods } from './methods.js';

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

export function sessionModel(
  methods: SessionsBridgeMethods,
  slug: string | null,
  sessionId: string,
  choice?: unknown,
): Promise<SessionModelState> {
  return unwrapAsync(
    methods.sessionModel({ slug, sessionId, ...(choice === undefined ? {} : { choice }) }),
  );
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

export function sessions(methods: SessionsBridgeMethods, slug: string, includeTitles?: boolean) {
  const result = methods.sessions({ slug, includeTitles });
  return result instanceof Promise ? unwrapAsync(result) : unwrap(result);
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

class SessionListRpc {
  declare readonly methods: BridgeMethods;

  sessions(slug: string): { sessions: OwnedSessionSummary[] };
  sessions(
    slug: string,
    includeTitles: boolean,
  ): { sessions: OwnedSessionSummary[] } | Promise<{ sessions: OwnedSessionSummary[] }>;
  sessions(slug: string, includeTitles?: boolean) {
    return sessions(this.methods, slug, includeTitles);
  }
}

export const sessionsRpcMethods = {
  sessionArchiveSet(
    slug: string,
    sessionId: string,
    archived: boolean,
  ): Promise<{ archived: boolean }> {
    return sessionArchiveSet(this.methods, slug, sessionId, archived);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const botSessionRpc = {
  botNewSession(slug: string): Promise<{ started: true }> {
    return botNewSession(this.methods, slug);
  },

  botCompact(slug: string): Promise<ManualCompactionResult> {
    return botCompact(this.methods, slug);
  },

  botContext(slug: string): Promise<import('../../runtime/context-window.js').BotContextWindow> {
    return botContext(this.methods, slug);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const sessionControlRpc = {
  channelBotStop(
    channelId: string,
    botSlug: string,
    autoContinueFor?: string,
  ): Promise<{
    stopped: { botSlug: string; sessionId: string; messageId: string };
  }> {
    return channelBotStop(this.methods, channelId, botSlug, autoContinueFor);
  },

  sessionMessageSend(botSlug: string | null, sessionId: string, text: string) {
    return unwrapAsync(this.methods.sessionMessageSend({ botSlug, sessionId, text }));
  },

  sessionStop(
    botSlug: string,
    sessionId?: string,
    channelId?: string,
    activityId?: string,
  ): Promise<{
    stopped: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
    alreadyIdle: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
    messageId?: string;
  }> {
    return sessionStop(this.methods, botSlug, sessionId, channelId, activityId);
  },

  botStop(
    botSlug: string,
    channelId?: string,
    autoContinueFor?: string,
  ): Promise<{
    stopped: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
    alreadyIdle: import('../../runtime/bot-runtime.js').StoppedSessionRef[];
    messageId?: string;
  }> {
    return botStop(this.methods, botSlug, channelId, autoContinueFor);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const compactionSettingsRpc = {
  idleCompaction(): IdleCompactionView {
    return idleCompaction(this.methods);
  },

  idleCompactionSet(enabled: boolean): IdleCompactionView {
    return idleCompactionSet(this.methods, enabled);
  },

  compactionThresholdSet(
    thresholdRatio?: number | null,
    headroomTokens?: number | null,
  ): IdleCompactionView {
    return compactionThresholdSet(this.methods, thresholdRatio, headroomTokens);
  },

  idleCompactionCacheLifetimeSet(
    provider: string,
    model: string,
    seconds: number | null,
  ): IdleCompactionView {
    return idleCompactionCacheLifetimeSet(this.methods, provider, model, seconds);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const sessionDetailsRpc = {
  sessionModel(
    slug: string | null,
    sessionId: string,
    choice?: unknown,
  ): Promise<SessionModelState> {
    return sessionModel(this.methods, slug, sessionId, choice);
  },

  sessionTranscript(slug: string | null, sessionId: string) {
    return unwrapAsync(this.methods.sessionTranscript({ slug, sessionId }));
  },

  sessionLive(
    slug: string | null,
    sessionId: string,
    after?: number,
  ): Promise<{ sessionId: string } & SessionLiveSnapshot> {
    return unwrapAsync(
      this.methods.sessionLive({ slug, sessionId, ...(after === undefined ? {} : { after }) }),
    );
  },

  sessionToolDetail(
    slug: string,
    sessionId: string,
    callId: string,
  ): Promise<{ sessionId: string; callId: string; detail: SessionToolDetail }> {
    return sessionToolDetail(this.methods, slug, sessionId, callId);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const sessionListRpc = {
  sessions: SessionListRpc.prototype.sessions,

  sessionList(search?: string, sort?: string, source?: string, queryVersion?: number) {
    return unwrapAsync(this.methods.sessionList({ search, sort, source, queryVersion }));
  },

  botToolTrace(
    slug: string,
    sessionId?: string,
    turns?: number,
  ): Promise<{ slug: string; sessionId: string; turns: TurnTrace[] }> {
    return botToolTrace(this.methods, slug, sessionId, turns);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const sessionOwnerRpc = {
  sessionOwner(sessionId: string): { owner: OwnedSessionBot | null } {
    return sessionOwner(this.methods, sessionId);
  },

  botSessionIds(): {
    sessionIds: string[];
    groups: { botSlug: string; displayName: string; sessionIds: string[] }[];
  } {
    return botSessionIds(this.methods);
  },
} satisfies ThisType<BridgeRpcReceiver>;
