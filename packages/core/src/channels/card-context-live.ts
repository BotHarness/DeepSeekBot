import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { BotHarnessCore } from '../plugin.js';
import type { BridgeMethods } from '../bridge/methods.js';
import { TeamError } from '../team/error.js';
import { ownsBot } from '../team/bot-access.js';
import type { ChannelUserQuestions } from './user-questions.js';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';

type Card = { channelId: string; messageId: string };

export function mountCardContextLive(
  ctx: Context,
  core: BotHarnessCore,
  bridge: Pick<BridgeMethods, 'toolApprovalStatus'>,
  approvals: Pick<ChannelToolApproval, 'subscribe'>,
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
  const tracked = new Map<string, Card & { last?: string }>();
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
          snapshot = bridge.toolApprovalStatus(card);
        } catch {
          ctx.logger.warn('botharness.approval-card-live phase=snapshot-failed');
          continue;
        }
        if (!snapshot.ok) {
          tracked.delete(id);
          continue;
        }
        const last = JSON.stringify(snapshot.value);
        if (card.last !== last) {
          card.last = last;
          publishCard('tool-approval', card);
        }
        const { status, execution } = snapshot.value;
        if (
          status !== 'pending' &&
          (execution === undefined || execution === 'settled' || execution === 'needs-repair')
        )
          tracked.delete(id);
      }
    });
  };
  const offApprovals = approvals.subscribe((notice) => {
    const { channelId, messageId } = notice;
    if (notice.role === 'assignment') {
      if (!tracked.has(messageId)) tracked.set(messageId, { channelId, messageId });
      refreshApprovals();
    } else publishCard('tool-approval', notice);
  });
  const offQuestions = questions.subscribeStatus((card) => publishCard('user-question', card));
  const contexts = new Map<string, string>();
  const contextKey = (slug: string) => {
    const sessionId = core.runtime.currentOrchestratorSessionId?.(slug);
    return JSON.stringify([sessionId, contextRoute(slug, sessionId)]);
  };
  const refreshContext = (slug: string, force = false): void => {
    if (!core.registry.get(slug)) return;
    try {
      const key = contextKey(slug);
      if (force || (contexts.has(slug) && contexts.get(slug) !== key)) publishContext(slug);
      contexts.set(slug, key);
    } catch {
      ctx.logger.warn('botharness.bot-context-live phase=snapshot-failed');
    }
  };
  const refreshContexts = () => {
    const slugs = new Set(core.registry.list().map((bot) => bot.slug));
    for (const slug of contexts.keys()) if (!slugs.has(slug)) contexts.delete(slug);
    for (const slug of slugs) refreshContext(slug);
  };
  refreshContexts();
  const offCommit = core.operationalDatabase.subscribe(({ topics }) => {
    if (topics.includes('assignments')) refreshApprovals();
    if (topics.includes('bot-registry') || topics.includes('session-ownership')) refreshContexts();
  });
  const updateSession = (sessionId: string, force: boolean) => {
    const owner = core.ownership.resolve(sessionId);
    if (owner?.rootRole !== 'orchestrator' || owner.parentSessionId !== undefined) return;
    refreshContext(
      owner.botSlug,
      force && core.runtime.currentOrchestratorSessionId?.(owner.botSlug) === sessionId,
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
  const offSettings = ctx.on('settings/document-updated', refreshContexts, { global: true });
  const offAdapters = ctx.on(
    'llm/adapters-updated',
    () => {
      for (const slug of contexts.keys()) refreshContext(slug, true);
    },
    { global: true },
  );
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
