import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { BotHarnessCore } from '../plugin.js';
import { TeamError } from '../team/error.js';
import { ownsBot } from '../team/bot-access.js';
import type { ChannelUserQuestions } from './user-questions.js';
import type { ChannelToolApproval, ToolApprovalNotice } from '../workspaces/tool-approval.js';
import { readToolApprovalState } from '../workspaces/tool-approval-state.js';

type Card = { channelId: string; messageId: string };

export function mountCardContextLive(
  ctx: Context,
  core: BotHarnessCore,
  approvals: Pick<ChannelToolApproval, 'subscribe' | 'status' | 'expiresAt'>,
  questions: Pick<ChannelUserQuestions, 'subscribeStatus'>,
  contextRoute: (slug: string, sessionId: string | undefined) => unknown,
): () => void {
  if (core.operationalDatabase.mode !== 'ready') return () => {};
  const publishCard = (resource: 'tool-approval' | 'user-question', card: Card) => {
    const { channelId, messageId } = card;
    core.live.publishScopedResourceChanged({ resource, channelId, messageId }, (human) => {
      const channel = core.channels.get(channelId);
      if (!channel || channel.deletedAt !== undefined) return false;
      if (
        !core.team.channelAccess.canRead(human, channelId) &&
        !(
          channel.type === 'group' &&
          (core.team.isOwner(human) || core.team.approvals.ownsRequest(human, channelId, messageId))
        )
      )
        return false;
      try {
        core.team.approvals.requireRequest(human, channelId, messageId);
        return true;
      } catch (error) {
        if (error instanceof TeamError) return false;
        throw error;
      }
    });
  };
  const publishContext = (slug: string) =>
    core.live.publishScopedResourceChanged(
      { resource: 'bot-context', slug },
      (human) =>
        ownsBot(human, core.registry.get(slug)) &&
        core.team.member(human.humanId)?.status === 'active',
    );
  const tracked = new Map<string, { notice: ToolApprovalNotice; last?: string }>();
  const approvalReader = { runtime: core.runtime, toolApproval: approvals };
  let queued = false;
  let closed = false;
  const refreshApprovals = () => {
    if (queued || tracked.size === 0) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (closed) return;
      for (const [id, card] of tracked) {
        let snapshot;
        try {
          snapshot = readToolApprovalState(approvalReader, card.notice);
        } catch {
          ctx.logger.warn('botharness.approval-card-live phase=snapshot-failed');
          continue;
        }
        const last = JSON.stringify(snapshot);
        if (card.last !== last) {
          card.last = last;
          publishCard('tool-approval', card.notice);
        }
        const { status, execution } = snapshot;
        if (
          status !== 'pending' &&
          (execution === undefined || execution === 'settled' || execution === 'needs-repair')
        )
          tracked.delete(id);
      }
    });
  };
  const offApprovals = approvals.subscribe((notice) => {
    const { messageId } = notice;
    if (notice.role === 'assignment') {
      if (!tracked.has(messageId)) tracked.set(messageId, { notice });
      refreshApprovals();
    } else publishCard('tool-approval', notice);
  });
  const offQuestions = questions.subscribeStatus((card) => publishCard('user-question', card));
  const contexts = new Map<string, string>();
  const contextKey = (slug: string) => {
    const sessionId = core.runtime.currentOrchestratorSessionId?.(slug);
    return JSON.stringify([sessionId, contextRoute(slug, sessionId)]);
  };
  type ContextRefresh = 'seed' | 'change' | 'force';
  const refreshContext = (slug: string, mode: ContextRefresh): void => {
    if (!core.registry.get(slug)) return;
    try {
      const key = contextKey(slug);
      if (mode === 'force' || (mode === 'change' && contexts.get(slug) !== key))
        publishContext(slug);
      contexts.set(slug, key);
    } catch {
      ctx.logger.warn('botharness.bot-context-live phase=snapshot-failed');
    }
  };
  const refreshContexts = (mode: ContextRefresh) => {
    const slugs = new Set(core.registry.list().map((bot) => bot.slug));
    for (const slug of contexts.keys()) if (!slugs.has(slug)) contexts.delete(slug);
    for (const slug of slugs) refreshContext(slug, mode);
  };
  refreshContexts('seed');
  const offCommit = core.operationalDatabase.subscribe(({ topics }) => {
    if (topics.includes('assignments')) refreshApprovals();
    if (topics.includes('bot-registry') || topics.includes('session-ownership'))
      refreshContexts('change');
  });
  const updateSession = (sessionId: string, force: boolean) => {
    const owner = core.ownership.resolve(sessionId);
    if (owner?.rootRole !== 'orchestrator' || owner.parentSessionId !== undefined) return;
    refreshContext(
      owner.botSlug,
      force && core.runtime.currentOrchestratorSessionId?.(owner.botSlug) === sessionId
        ? 'force'
        : 'change',
    );
  };
  const sessionLifecycle = ({ agent }: { agent: Agent }) => updateSession(agent.session.id, true);
  const offCreated = ctx.on(
    'agent/created',
    (event) => {
      sessionLifecycle(event);
      return undefined;
    },
    { global: true },
  );
  const offDisposed = ctx.on('agent/disposed', sessionLifecycle, { global: true });
  const offSession = ctx.on(
    'session/event',
    (session, event) => {
      if (event.type === 'turn/end' || event.type === 'compaction/end')
        updateSession(session.id, true);
      else if (event.type === 'request/header') updateSession(session.id, false);
    },
    { global: true },
  );
  const offSettings = ctx.on('settings/document-updated', () => refreshContexts('change'), {
    global: true,
  });
  const offAdapters = ctx.on('llm/adapters-updated', () => refreshContexts('force'), {
    global: true,
  });
  return () => {
    closed = true;
    tracked.clear();
    offAdapters();
    offSettings();
    offSession();
    offDisposed();
    offCreated();
    offCommit();
    offQuestions();
    offApprovals();
  };
}
