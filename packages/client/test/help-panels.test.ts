import { expect, it } from 'vitest';
import { createHelpService } from '../src/client/help-service.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { installPanelHelp } from '../src/client/help-panels.js';
it('covers registered categories and lets a plugin own its help without duplicates', () => {
  const help = createHelpService(() => () => {});
  const panels = createDockPanelRegistry();
  const stop = installPanelHelp(help, panels);
  const removePanel = panels.register({
    id: 'memory-files',
    title: 'Memory',
    scope: 'channel',
    icon: 'brain',
    component: () => null,
  });
  expect(help.topics().filter((topic) => topic.panelId)).toHaveLength(1);
  expect(help.search('memory')).toHaveLength(3);
  expect(help.topics()[0]!.questions.every((q) => q.answer.en && q.answer.zh)).toBe(true);
  const removePlugin = help.register({
    id: 'plugin:help',
    topics: [
      {
        id: 'plugin:memory',
        panelId: 'memory-files',
        title: { en: 'Plugin memory' },
        overview: { en: '' },
        questions: [
          {
            id: 'plugin:question',
            title: { en: 'Plugin question' },
            answer: { en: 'Plugin answer' },
          },
        ],
      },
    ],
  });
  expect(help.topics().filter((topic) => topic.panelId)).toHaveLength(1);
  expect(help.topics().find((topic) => topic.panelId)?.id).toBe('plugin:memory');
  removePlugin();
  expect(help.topics().filter((topic) => topic.panelId)).toHaveLength(1);
  expect(help.search('memory')).toHaveLength(3);
  removePanel();
  expect(help.topics().filter((topic) => topic.panelId)).toHaveLength(0);
  stop();
  expect(help.topics()).toHaveLength(0);
});

it('authors bilingual built-in overviews, separate basics and honest unknown-panel help', () => {
  const help = createHelpService(() => () => {});
  const panels = createDockPanelRegistry();
  const ids = [
    'bh:channels',
    'bh:home',
    'bh:channel-body',
    'memory-files',
    'memory-evolution',
    'sessions',
    'bot-inbox',
    'schedules',
    'members',
    'activity-center',
    'bot-market',
    'botharness-browser',
    'botharness-computer',
  ];
  for (const id of [...ids, 'user-guide', 'unknown'])
    panels.register({ id, title: id, scope: 'global', component: () => null });
  const stop = installPanelHelp(help, panels);
  for (const id of ids) {
    const topic = help.topics().find((item) => item.panelId === id)!;
    expect(topic.overview.en).not.toContain('no authored help');
    expect(topic.overview.zh).toBeTruthy();
    expect(topic.questions.every((question) => question.title.zh && question.answer.zh)).toBe(true);
  }
  expect(help.topics().some((topic) => topic.panelId === 'user-guide')).toBe(false);
  expect(help.topics().find((topic) => topic.panelId === 'unknown')?.overview.en).toContain(
    'no authored help',
  );
  expect(
    help.topics().find((topic) => topic.id === 'botharness:panel-basics-topic')?.panelId,
  ).toBeUndefined();
  expect(help.search('Which panels follow')[0]?.guide).toBeUndefined();
  stop();
});

it('deduplicates definition categories while layout practice resolves live pinned instances', () => {
  const help = createHelpService(() => () => {});
  const panels = createDockPanelRegistry();
  panels.register({
    id: 'example',
    title: 'Example',
    scope: 'channel',
    binding: 'current-bot',
    component: () => null,
  });
  panels.attach({ open: () => {}, close: () => {}, canOpen: () => true });
  const stop = installPanelHelp(help, panels);
  panels.createInstance('example', 'bot-a', 'Bot A');
  panels.createInstance('example', 'bot-a', 'Bot A again');
  expect(help.topics().filter((topic) => topic.panelId)).toHaveLength(1);
  expect(help.availability('botharness:panel-help:example:layout')).toMatchObject({
    status: 'select',
    targets: expect.arrayContaining([{ id: 'example', label: 'Example' }]),
  });
  stop();
});
