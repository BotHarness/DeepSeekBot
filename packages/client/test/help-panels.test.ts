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
  expect(help.topics()).toHaveLength(1);
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
  expect(help.topics()).toHaveLength(1);
  expect(help.topics()[0]!.id).toBe('plugin:memory');
  removePlugin();
  expect(help.topics()).toHaveLength(1);
  expect(help.search('memory')).toHaveLength(3);
  removePanel();
  expect(help.topics()).toHaveLength(0);
  stop();
});
