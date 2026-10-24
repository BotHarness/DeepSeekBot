import { expect, it, vi } from 'vitest';
import { createQuickSwitcherNavigation } from '../src/client/quick-switcher-navigation.js';
import { createHelpService } from '../src/client/help-service.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';

it('searches canonical panel and FAQ entries, toggles panels, and reveals a question without starting a guide', () => {
  const panels = createDockPanelRegistry();
  const reveal = vi.fn();
  const present = vi.fn(() => () => {});
  const help = createHelpService(present, reveal);
  panels.register({ id: 'memory', title: 'Memory', scope: 'global', component: () => null });
  panels.attach({
    open: (id) => panels.reportOpen([id]),
    close: () => panels.reportOpen([]),
    canOpen: () => true,
  });
  const remove = help.register({
    id: 'test:help',
    topics: [
      {
        id: 'test:memory',
        title: { en: 'Memory' },
        overview: { en: '' },
        questions: [
          {
            id: 'test:question',
            title: { en: 'How to read memory?' },
            answer: { en: 'Open Memory' },
          },
        ],
      },
    ],
  });
  const navigation = createQuickSwitcherNavigation(panels, help, zhTranslate);
  const changed = vi.fn();
  const off = navigation.subscribe(changed);
  const results = navigation.search('memory');
  expect(results.map((result) => result.kind)).toEqual(['panel', 'faq']);
  expect(results[0]!.description).toContain('已关闭');
  navigation.activate(results[0]!);
  expect(panels.isOpen('memory')).toBe(true);
  expect(navigation.search('memory')[0]!.description).toContain('已打开');
  navigation.activate(navigation.search('memory')[0]!);
  expect(panels.isOpen('memory')).toBe(false);
  navigation.activate(results[1]!);
  expect(help.selection()?.questionId).toBe('test:question');
  expect(reveal).toHaveBeenCalledOnce();
  expect(present).not.toHaveBeenCalled();
  remove();
  expect(navigation.search('memory').map((result) => result.kind)).toEqual(['panel']);
  navigation.activate(results[1]!);
  expect(reveal).toHaveBeenCalledOnce();
  expect(changed).toHaveBeenCalled();
  off();
});
