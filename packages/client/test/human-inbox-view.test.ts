import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./human-inbox-test-controls.js')),
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: () => null,
}));

vi.mock('../src/client/bot-sidebar.js', async () => {
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => store.getSnapshot() };
});

import type { BridgeActions } from '../src/client/actions.js';
import { HumanInboxView } from '../src/client/human-inbox-view.js';
import { store, type HumanAttentionItem } from '../src/client/store.js';

const join: HumanAttentionItem = {
  id: 'join:request-1',
  category: 'action',
  kind: 'group-join-request',
  createdAt: '2026-09-26T00:00:00.000Z',
  channelId: 'group-team',
  channelName: 'Team',
  botSlug: 'ada',
  summary: '',
  requestId: 'request-1',
};

afterEach(() => {
  store.select(undefined);
  store.setRoster([], []);
});

describe('Human Inbox center view', () => {
  it('offers canonical request context and answer navigation for handled work', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'handled',
      items: [
        {
          id: 'handled-question:source',
          category: 'handled',
          kind: 'user-question',
          createdAt: '2026-10-01T10:05:00Z',
          channelId: 'dm-ada',
          channelName: 'Ada',
          botSlug: 'ada',
          summary: 'Choose release route',
          messageId: 'request',
          sourceEventId: 'source',
          responseMessageId: 'answer',
          responseSourceEventId: 'answer-source',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('已处理');
    expect(markup).toContain('查看答复');
    expect(markup).toContain('查看上下文');
    expect(markup).not.toContain('回答问题</button>');
  });

  it('defaults to action-required and offers source and decision actions', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({ status: 'ready', category: 'action', items: [join] });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('需要你处理');
    expect(markup).not.toContain('role="tab"');
    expect(markup).toContain('申请加入');
    expect(markup).toContain('查看来源');
    expect(markup).toContain('同意');
    expect(markup).toContain('拒绝');
  });

  it('renders a Channel unread summary with a deliberate read action and expandable preview', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'unread',
      items: [
        {
          ...join,
          id: 'unread:dm-ada',
          category: 'unread',
          kind: 'channel-unread',
          summary: 'The draft is ready.',
          messageId: 'message-1',
          unreadCount: 3,
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('3 条未读');
    expect(markup).toContain('bh-human-inbox-row-open');
    expect(markup).not.toContain('<details>');
    expect(markup).toContain('The draft is ready.');
    expect(markup).toContain('标为已读');
    expect(markup).not.toContain('申请加入');
    expect(markup).not.toContain('同意</button>');
  });
  it('shows a Bot Workspace Grant request as an action linked to its DM card', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [
        {
          id: 'grant:source-1',
          category: 'action',
          kind: 'workspace-grant-request',
          createdAt: '2026-09-26T00:00:00.000Z',
          channelId: 'dm-ada',
          channelName: 'Ada DM',
          botSlug: 'ada',
          summary: 'Please grant access.',
          messageId: 'grant-request-1',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('请求工作区授权');
    expect(markup).toContain('Please grant access.');
    expect(markup).toContain('查看来源');
    expect(markup).not.toContain('已了解');
  });

  it('shows an unresolved native question as an action linked to its DM', () => {
    store.setRoster(
      [],
      [
        {
          id: 'dm-ada',
          type: 'dm',
          name: 'Ada DM',
          members: ['ada'],
          botSlug: 'ada',
          createdAt: '2026-09-26T00:00:00.000Z',
          updatedAt: '2026-09-26T00:00:00.000Z',
        },
      ],
    );
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [
        {
          id: 'question:source-1',
          category: 'action',
          createdAt: '2026-09-26T00:00:00.000Z',
          botSlug: 'ada',
          kind: 'user-question',
          channelId: 'dm-ada',
          channelName: 'Ada DM',
          summary: 'Which branch should I use?',
          messageId: 'question-one',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('ada 需要你回答');
    expect(markup).toContain('Which branch should I use?');
    expect(markup).toContain('Ada DM');
    expect(markup).toContain('查看来源');
    expect(markup).not.toContain('已了解');
    expect(markup).not.toContain('同意</button>');
  });
  it('shows an Assignment request as an action with a source link', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [
        {
          id: 'assignment:session-1',
          category: 'action',
          kind: 'assignment-waiting-human',
          createdAt: '2026-09-26T00:00:00.000Z',
          botSlug: 'ada',
          assignmentSessionId: 'session-1',
          summary: 'Should I choose A or B?',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('ada 的事项需要你协助');
    expect(markup).toContain('Should I choose A or B?');
    expect(markup).toContain('查看来源');
    expect(markup).not.toContain('已了解');
    expect(markup).not.toContain('同意</button>');
  });

  it('shows a blocked Assignment as an action linked to its Session', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [
        {
          id: 'assignment:session-1',
          category: 'action',
          kind: 'assignment-blocked',
          createdAt: '2026-09-26T00:00:00.000Z',
          botSlug: 'ada',
          assignmentSessionId: 'session-1',
          sourceEventId: 'report-event-1',
          summary: 'Need a new grant.',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('ada 的事项受阻，需要关注');
    expect(markup).toContain('Need a new grant.');
    expect(markup).toContain('查看来源');
    expect(markup).not.toContain('忽略');
  });

  it('shows a completed Assignment report as informational with Ignore', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'info',
      items: [
        {
          id: 'report:event-1',
          category: 'info',
          kind: 'assignment-report',
          createdAt: '2026-09-26T00:00:00.000Z',
          botSlug: 'ada',
          assignmentSessionId: 'session-1',
          sourceEventId: 'event-1',
          summary: 'Research completed.',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('ada 的事项已报告完成');
    expect(markup).toContain('Research completed.');
    expect(markup).toContain('查看来源');
    expect(markup).toContain('忽略');
    expect(markup).not.toContain('同意</button>');
  });

  it('shows compact source navigation for repairs and a Bot Inbox fallback for missing sources', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [
        {
          id: 'repair:event-1:ada',
          category: 'action',
          kind: 'bot-message-needs-repair',
          createdAt: '2026-09-26T05:00:00.000Z',
          botSlug: 'ada',
          channelId: 'group-team',
          channelName: 'Team',
          messageId: 'review-1',
          sourceEventId: 'event-1',
          summary: 'Check the deployment',
        },
      ],
    });
    let markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('ada 的消息需要检查');
    expect(markup).toContain('Check the deployment');
    expect(markup).not.toContain('查看 Bot 收件箱</button>');
    expect(markup).toContain('查看来源');
    expect(markup).not.toContain('忽略</button>');

    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [{ ...store.getSnapshot().humanInbox.items[0]!, channelName: '' }],
    });
    markup = renderToStaticMarkup(createElement(HumanInboxView, { actions: {} as BridgeActions }));
    expect(markup).toContain('来源频道已不可用');

    const missingMessage = { ...store.getSnapshot().humanInbox.items[0]!, channelName: 'Team' };
    delete missingMessage.messageId;
    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [missingMessage],
    });
    markup = renderToStaticMarkup(createElement(HumanInboxView, { actions: {} as BridgeActions }));
    expect(markup).toContain('来源消息已不可用');
    expect(markup).not.toContain('来源频道已不可用');
  });
});
