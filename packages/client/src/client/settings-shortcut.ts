import type { BotSettings } from './bot-settings.js';
import { webModalOpen } from './channel-shortcuts.js';
import type { ShortcutBindings } from './shortcut-bindings.js';

export function mountSettingsShortcut(options: {
  document: Document;
  bindings: Pick<ShortcutBindings, 'matches'>;
  botSettings: Pick<BotSettings, 'getSnapshot' | 'open'>;
  active: () => boolean;
}): () => void {
  const { document: doc, bindings, botSettings, active } = options;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!active() || !bindings.matches('settings', event)) return;
    if (botSettings.getSnapshot().open) {
      event.preventDefault();
      return;
    }
    if (webModalOpen(doc)) return;
    event.preventDefault();
    botSettings.open();
  };
  doc.addEventListener('keydown', onKeyDown);
  return () => doc.removeEventListener('keydown', onKeyDown);
}
