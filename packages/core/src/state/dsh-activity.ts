import type { ToolCallView } from '@deepseek-ai/dsh-tools';
import {
  aggregateToolActivity,
  activityEffectForToolKind,
  toolKindForView,
  isPublicToolDetail,
  isSessionActivityName,
  type PersonaBotToolActivity,
} from './tool-activity.js';
import type { SessionOwnership, SessionOwnershipRecord } from '../sessions/ownership.js';
import type { DshSessionEvent } from '../sessions/source.js';
import type { ToolDetailIndex } from './tool-details.js';
import type { BotStateTracker, SessionState } from './bot-state.js';

export function sessionStateForEvent(event: DshSessionEvent): SessionState | undefined {
  switch (event.type) {
    case 'tool/call':
      return 'working';
    case 'turn/start':
    case 'step/start':
    case 'user/message':
    case 'assistant/message':
    case 'assistant/attempt':
    case 'tool/result':
      return 'thinking';
    case 'turn/end':
      return 'done';
    default:
      return undefined;
  }
}

function outsideClosedTurn(turnOpen: boolean | undefined, event: DshSessionEvent): boolean {
  return turnOpen === false && event.type !== 'turn/start' && event.type !== 'turn/end';
}

function nextTurnOpen(turnOpen: boolean | undefined, event: DshSessionEvent): boolean | undefined {
  if (event.type === 'turn/start') return true;
  if (event.type === 'turn/end') return false;
  return turnOpen;
}

export function deriveSessionState(events: readonly DshSessionEvent[]): SessionState | undefined {
  let state: SessionState | undefined;
  let turnOpen: boolean | undefined;
  for (const event of events) {
    const next = outsideClosedTurn(turnOpen, event) ? undefined : sessionStateForEvent(event);
    turnOpen = nextTurnOpen(turnOpen, event);
    if (next !== undefined) state = next;
  }
  return state;
}

export interface DshActivitySessionHeader {
  parentSession?: string;
  origin?: 'subagent';
}

export interface DshActivitySession {
  id: string;
  header: DshActivitySessionHeader;
  snapshotEvents(): readonly DshSessionEvent[];
}

export interface DshActivityRebuildReport {
  rebuilt: number;

  attributed: number;

  unowned: number;
}

export interface DshActivityProjection {
  handleSessionEvent(sessionId: string, event: DshSessionEvent): void;

  handleAgentCreated(session: DshActivitySession): boolean;

  handleSessionDisposed(sessionId: string): void;

  rebuild(sessions: readonly DshActivitySession[]): DshActivityRebuildReport;
}

export function createDshActivityProjection(options: {
  ownership: SessionOwnership;
  states: BotStateTracker;
  now?: () => Date;
  details?: ToolDetailIndex;
  describeCall?(
    sessionId: string,
    name: string,
    args: unknown,
  ): { name: string; view?: ToolCallView; publicDetail?: string } | undefined;
}): DshActivityProjection {
  const { ownership, states } = options;
  const now = options.now ?? (() => new Date());

  const names = new Map<string, string>();
  const turnOpen = new Map<string, boolean>();
  const pending = new Map<string, Map<string, PersonaBotToolActivity>>();
  const project = (sessionId: string, event: DshSessionEvent): SessionState | undefined => {
    if (event.type === 'session/title') {
      const title =
        typeof event.data === 'object' && event.data !== null && 'title' in event.data
          ? event.data.title
          : undefined;
      if (isSessionActivityName(title)) names.set(sessionId, title);
      else names.delete(sessionId);
    }
    const detailRef = options.details?.observe(sessionId, event);
    const open = turnOpen.get(sessionId);
    const next = nextTurnOpen(open, event);
    if (next !== undefined) turnOpen.set(sessionId, next);
    if (outsideClosedTurn(open, event)) return undefined;
    const state = sessionStateForEvent(event);
    if (state === undefined) return undefined;
    let calls = pending.get(sessionId);
    if (calls === undefined) {
      calls = new Map();
      pending.set(sessionId, calls);
    }
    const data =
      typeof event.data === 'object' && event.data !== null
        ? (event.data as Record<string, unknown>)
        : {};
    if (event.type === 'tool/call') {
      const name =
        typeof data['name'] === 'string' && /^[A-Za-z0-9_.:/-]{1,80}$/.test(data['name'])
          ? data['name']
          : undefined;
      const callId = typeof data['callId'] === 'string' ? data['callId'] : undefined;
      let declaration: { name: string; view?: ToolCallView; publicDetail?: string } | undefined;
      try {
        if (name !== undefined && typeof data['arguments'] === 'string')
          declaration = options.describeCall?.(sessionId, name, JSON.parse(data['arguments']));
      } catch {}
      const toolKind = toolKindForView(declaration?.view);
      const toolName =
        declaration !== undefined && /^[A-Za-z0-9_.:/-]{1,80}$/.test(declaration.name)
          ? declaration.name
          : undefined;
      if (callId !== undefined)
        calls.set(callId, {
          toolKind,
          effect: activityEffectForToolKind(toolKind),
          ...(toolName === undefined ? {} : { toolName }),
          ...(isPublicToolDetail(declaration?.publicDetail)
            ? { publicDetail: declaration.publicDetail }
            : {}),
          startedAt:
            Number.isSafeInteger(event.time) && event.time >= 0 ? event.time : now().getTime(),
          activeToolCount: 1,
          ...(detailRef === undefined ? {} : { detailRefs: [detailRef] }),
        });
    } else if (event.type === 'tool/result') {
      const message = data['message'];
      if (
        typeof message === 'object' &&
        message !== null &&
        'toolCallId' in message &&
        typeof message.toolCallId === 'string'
      )
        calls.delete(message.toolCallId);
    } else if (
      event.type === 'turn/end' ||
      event.type === 'turn/start' ||
      event.type === 'step/start'
    )
      calls.clear();
    return calls.size > 0 ? 'working' : state;
  };

  const activityForSession = (sessionId: string, owner: SessionOwnershipRecord) => {
    const activity = aggregateToolActivity([...(pending.get(sessionId)?.values() ?? [])]);
    if (activity === undefined) return undefined;
    return {
      ...activity,
      sources: [{ role: owner.provenance === 'subagent' ? 'subagent' : owner.rootRole, count: 1 }],
    } satisfies PersonaBotToolActivity;
  };

  const attribute = (session: DshActivitySession): boolean => {
    if (ownership.resolve(session.id) !== undefined) return false;
    const parentId = session.header.parentSession;
    if (parentId === undefined) return false;
    const parent = ownership.resolve(parentId);
    if (parent === undefined) return false;
    ownership.claim({
      sessionId: session.id,
      botSlug: parent.botSlug,
      rootRole: 'assignment',
      provenance: session.header.origin === 'subagent' ? 'subagent' : 'fork',
      parentSessionId: parentId,
      at: now().toISOString(),
    });
    return true;
  };

  return {
    handleSessionEvent(sessionId, event) {
      const owner = ownership.resolve(sessionId);
      if (owner === undefined) return;
      const state =
        project(sessionId, event) ??
        (event.type === 'session/title'
          ? states.snapshot(owner.botSlug).sessions[sessionId]
          : undefined);
      if (state === undefined) return;
      states.setSessionState(
        owner.botSlug,
        sessionId,
        state,
        activityForSession(sessionId, owner),
        owner.provenance === 'subagent' ? 'subagent' : owner.rootRole,
        names.get(sessionId),
      );
    },
    handleAgentCreated(session) {
      const attributed = attribute(session);
      if (ownership.resolve(session.id) !== undefined) {
        for (const event of session.snapshotEvents()) {
          if (event.type === 'session/title') project(session.id, event);
        }
      }
      return attributed;
    },
    handleSessionDisposed(sessionId) {
      const owner = ownership.resolve(sessionId);
      if (owner === undefined) return;
      options.details?.revokeSession(sessionId);
      pending.delete(sessionId);
      names.delete(sessionId);
      turnOpen.delete(sessionId);
      states.clearSession(owner.botSlug, sessionId);
    },
    rebuild(sessions) {
      options.details?.clear();
      let attributed = 0;
      let claimed = true;
      while (claimed) {
        claimed = false;
        for (const session of sessions) {
          if (attribute(session)) {
            claimed = true;
            attributed += 1;
          }
        }
      }
      let rebuilt = 0;
      let unowned = 0;
      const rows: Parameters<BotStateTracker['rebuildSessionStates']>[0][number][] = [];
      for (const session of sessions) {
        const owner = ownership.resolve(session.id);
        if (owner === undefined) {
          unowned += 1;
          continue;
        }
        pending.delete(session.id);
        names.delete(session.id);
        turnOpen.delete(session.id);
        let state: SessionState | undefined;
        for (const event of session.snapshotEvents()) state = project(session.id, event) ?? state;
        if (state === undefined) continue;
        const activity = activityForSession(session.id, owner);
        rows.push({
          slug: owner.botSlug,
          sessionId: session.id,
          state,
          role: owner.provenance === 'subagent' ? 'subagent' : owner.rootRole,
          ...(activity === undefined ? {} : { activity }),
          ...(names.get(session.id) === undefined ? {} : { name: names.get(session.id)! }),
        });
        rebuilt += 1;
      }
      states.rebuildSessionStates(rows);
      return { rebuilt, attributed, unowned };
    },
  };
}
