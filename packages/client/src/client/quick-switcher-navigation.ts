import type { ClientHelpService } from '../help-api.js';
import type { DockPanelHost } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { searchTextMatches } from './search-match.js';
import { helpText } from './help-text.js';

export interface QuickNavigationResult {
  kind: 'panel' | 'faq';
  id: string;
  title: string;
  description: string;
  icon: string;
  disabled: boolean;
}
export interface QuickSwitcherNavigation {
  subscribe(listener: () => void): () => void;
  snapshot(): number;
  search(query: string): readonly QuickNavigationResult[];
  activate(result: QuickNavigationResult): void;
}
export function createQuickSwitcherNavigation(
  panels: DockPanelHost,
  help: ClientHelpService,
  t: BotHarnessTranslate,
): QuickSwitcherNavigation {
  let version = 0;
  return {
    snapshot: () => version,
    subscribe(listener) {
      const changed = () => {
        version++;
        listener();
      };
      const offPanels = panels.subscribe(changed);
      const offHelp = help.subscribe(changed);
      return () => {
        offPanels();
        offHelp();
      };
    },
    search(query) {
      if (!query.trim()) return [];
      const panelResults = panels
        .panels()
        .filter(
          (panel) => !panel.id.startsWith('instance:') && searchTextMatches(panel.title, query),
        )
        .map((panel): QuickNavigationResult => ({
          kind: 'panel',
          id: panel.id,
          title: panel.title,
          icon: panel.icon ?? 'panels-top-left',
          description: t(
            panels.isOpen(panel.id) ? 'quickSwitcher.panelOn' : 'quickSwitcher.panelOff',
          ),
          disabled: !panels.available() || !(panels.canOpen?.(panel.id) ?? true),
        }));
      const questions = help
        .search(query)
        .slice(0, 20)
        .map((question): QuickNavigationResult => ({
          kind: 'faq',
          id: question.id,
          title: helpText(question.title, t),
          icon: 'info',
          description: `${t('quickSwitcher.help')} · ${helpText(help.topics().find((topic) => topic.questions.some((item) => item.id === question.id))!.title, t)}`,
          disabled: !panels.available(),
        }));
      return [...panelResults, ...questions];
    },
    activate(result) {
      if (!panels.available()) return;
      if (result.kind === 'faq') {
        if (
          help
            .topics()
            .some((topic) => topic.questions.some((question) => question.id === result.id))
        )
          help.show(result.id);
      } else if (
        panels.panels().some((panel) => panel.id === result.id) &&
        (panels.canOpen?.(result.id) ?? true)
      )
        panels.toggle(result.id);
    },
  };
}
