import {
  createElement,
  type ButtonHTMLAttributes,
  type ReactNode,
  type PropsWithChildren,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { PersonaBotFacepileItem } from '../src/client/avatar.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: ({ path }: { path: string }) =>
    createElement('span', { 'data-file-type-icon': path }),
  IconCloseOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  ImageLightbox: () => null,
}));

import { ChannelComposer } from '../src/client/channel-composer.js';
import { groupComposerActivity } from '../src/client/group-composer-activity.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  createBotStateTracker,
  personaBotActivitySnapshot,
} from '../../core/src/state/bot-state.js';

const working: PersonaBotFacepileItem = {
  personaBotId: 'nova',
  name: 'Nova <QA>',
  state: 'working',
  activity: {
    effect: 'executing',
    toolKind: 'execute',
    toolName: 'bash',
    publicDetail: 'Bounded public operation',
    startedAt: 1000,
    activeToolCount: 1,
  },
  sessions: [
    {
      id: 'activity-11111111-1111-4111-8111-111111111111',
      role: 'assignment',
      name: 'Session-only name',
      revision: 4,
      at: 1000,
      state: 'working',
      activity: {
        effect: 'searching',
        toolKind: 'search',
        publicDetail: 'Session-only detail',
        startedAt: 1000,
        activeToolCount: 1,
      },
    },
  ],
};
const thinking: PersonaBotFacepileItem = {
  personaBotId: 'orbit',
  name: 'Orbit',
  state: 'thinking',
};
const information: PersonaBotFacepileItem = {
  personaBotId: 'info',
  name: 'Info',
  state: 'idle',
  attention: { approvalCount: 0, informationalCount: 1 },
};
const quiet: PersonaBotFacepileItem = { personaBotId: 'quiet', name: 'Quiet', state: 'idle' };

it('orders active members consistently and leaves informational-only members out', () => {
  const members = [quiet, information, thinking, working];
  const first = groupComposerActivity(members, zhTranslate);
  const shuffled = groupComposerActivity([working, thinking, information, quiet], zhTranslate);
  expect(first).toEqual(shuffled);
  expect(first?.items.map((item) => item.personaBotId)).toEqual(['nova', 'orbit']);
  expect(first?.items[0]).toBe(working);
  expect(information.state).toBe('idle');
  expect(members).toEqual([quiet, information, thinking, working]);
  expect(first?.summary).toContain('Nova <QA> 正在执行');
  expect(first?.summary).toContain('Orbit 正在思考');
  expect(first?.summary).not.toContain('Info');
  expect(first?.summary).not.toContain('Session-only');
});

it('does not present idle members or empty attention metadata as running work', () => {
  expect(
    groupComposerActivity(
      [quiet, { ...quiet, personaBotId: 'zero', attention: { approvalCount: 0 } }],
      zhTranslate,
    ),
  ).toBeUndefined();
  expect(groupComposerActivity([], zhTranslate)).toBeUndefined();
  expect(groupComposerActivity([information], zhTranslate)).toBeUndefined();
  const approval = { ...information, attention: { approvalCount: 1, informationalCount: 1 } };
  expect(groupComposerActivity([approval], zhTranslate)?.items).toEqual([approval]);
});

it('renders one named row per Bot from its shared aggregate instead of flattening Sessions', () => {
  const activity = groupComposerActivity([thinking, working], zhTranslate);
  const markup = renderToStaticMarkup(
    createElement(ChannelComposer, {
      value: '',
      placeholder: 'Group',
      sending: false,
      activity,
      onChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );
  expect(
    markup.match(/class="bh-composer-activity-session bh-composer-activity-bot"/gu),
  ).toHaveLength(2);
  expect(markup).toContain('data-bot-id="nova"');
  expect(markup).toContain('Nova &lt;QA&gt;');
  expect(markup).toContain('Bounded public operation');
  expect(markup).not.toContain('Session-only name');
  expect(markup).not.toContain('Session-only detail');
  expect(markup).not.toContain('bh-composer-activity-source-label" title="任务会话');
  expect(markup.match(/class="bh-avatar-facepile-button"/gu)).toHaveLength(2);
  expect(markup).not.toContain('<details open');
});

it('keeps every Bot in the list while the facepile is bounded to three with accurate overflow', () => {
  const members = [
    working,
    thinking,
    { ...thinking, personaBotId: 'a', name: 'A' },
    { ...thinking, personaBotId: 'b', name: 'B' },
  ];
  const activity = groupComposerActivity(members, zhTranslate);
  const markup = renderToStaticMarkup(
    createElement(ChannelComposer, {
      value: '',
      placeholder: 'Group',
      sending: false,
      activity,
      onChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );
  expect(
    markup.match(/class="bh-composer-activity-session bh-composer-activity-bot"/gu),
  ).toHaveLength(4);
  expect(markup.match(/class="bh-avatar-facepile-button"/gu)).toHaveLength(3);
  expect(markup).toContain('>+1</span>');
  expect(activity?.summary).toContain('另有 2 个');
});

it('follows Host Orchestrator priority and Assignment handoff without changing another member', () => {
  const states = createBotStateTracker();
  const assignmentTool = {
    effect: 'searching' as const,
    toolKind: 'search' as const,
    toolName: 'grep',
    publicDetail: 'Find project references',
    startedAt: 10,
    activeToolCount: 1,
    sources: [{ role: 'assignment' as const, count: 1 }],
    arguments: 'PRIVATE_ARGUMENTS',
    results: 'PRIVATE_RESULTS',
    reasoning: 'PRIVATE_REASONING',
  };
  states.setSessionState('owner', 'private-assignment', 'working', assignmentTool, 'assignment');
  states.setSessionState('owner', 'private-orchestrator', 'thinking', undefined, 'orchestrator');
  const renderCurrent = () => {
    const snapshot = personaBotActivitySnapshot(['owner', 'quiet'], states);
    const members: PersonaBotFacepileItem[] = snapshot.bots.map((bot) => ({
      personaBotId: bot.slug,
      name: bot.slug === 'owner' ? 'Owner' : 'Quiet',
      state: bot.state,
      activity: bot.activity,
      attention: bot.attention,
      sessions: bot.sessions,
    }));
    const activity = groupComposerActivity(members, zhTranslate);
    return {
      snapshot,
      activity,
      markup: renderToStaticMarkup(
        createElement(ChannelComposer, {
          value: '',
          placeholder: 'Group',
          sending: false,
          activity,
          onChange: () => undefined,
          onSubmit: () => undefined,
        }),
      ),
    };
  };
  const thinking = renderCurrent();
  expect(thinking.activity?.summary).toContain('Owner 正在思考');
  expect(thinking.markup).not.toContain('Find project references');
  expect(thinking.markup).not.toContain('grep');
  expect(thinking.snapshot.bots[1]?.state).toBe('idle');
  states.setSessionState('owner', 'private-orchestrator', 'done', undefined, 'orchestrator');
  const handoff = renderCurrent();
  expect(handoff.snapshot.revision).toBeGreaterThan(thinking.snapshot.revision);
  expect(handoff.activity?.items).toHaveLength(1);
  expect(handoff.markup).toContain('data-bot-id="owner"');
  expect(handoff.markup).toContain('Find project references');
  expect(handoff.markup).toContain('grep');
  expect(handoff.markup).not.toMatch(/PRIVATE_|private-assignment|private-orchestrator/);
  expect(handoff.snapshot.bots[1]?.state).toBe('idle');
  states.setSessionState('owner', 'private-assignment', 'done', undefined, 'assignment');
  const idle = renderCurrent();
  expect(idle.activity).toBeUndefined();
  expect(idle.markup).not.toContain('bh-composer-activity-status');
  expect(idle.snapshot.bots.every((bot) => bot.state === 'idle')).toBe(true);
});
