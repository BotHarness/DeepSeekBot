// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({}));

import { BotSettings } from '../src/client/bot-settings.js';
import { mountSettingsShortcut } from '../src/client/settings-shortcut.js';
import { ShortcutBindings } from '../src/client/shortcut-bindings.js';

const press = (target: EventTarget, init: KeyboardEventInit = {}): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key: ',',
    code: 'Comma',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

describe('Bot settings shortcut', () => {
  let dispose = () => {};
  afterEach(() => {
    dispose();
    document.body.replaceChildren();
  });

  const mount = (botMode = true, mac = false) => {
    const botSettings = new BotSettings();
    let active = botMode;
    dispose = mountSettingsShortcut({
      document,
      bindings: new ShortcutBindings(undefined, () => mac),
      botSettings,
      active: () => active,
    });
    return {
      botSettings,
      setActive: (value: boolean) => {
        active = value;
      },
    };
  };

  it('opens Bot settings with Ctrl+, in Bot mode, also from the composer', () => {
    const { botSettings } = mount();
    const composer = document.body.appendChild(document.createElement('textarea'));
    expect(press(composer).defaultPrevented).toBe(true);
    expect(botSettings.getSnapshot().open).toBe(true);
  });

  it('uses ⌘, on macOS', () => {
    const { botSettings } = mount(true, true);
    expect(press(document.body).defaultPrevented).toBe(false);
    expect(botSettings.getSnapshot().open).toBe(false);
    press(document.body, { ctrlKey: false, metaKey: true });
    expect(botSettings.getSnapshot().open).toBe(true);
  });

  it('keeps the section already chosen and does nothing more while open', () => {
    const { botSettings } = mount();
    botSettings.open('shortcuts');
    botSettings.close();
    press(document.body);
    expect(botSettings.getSnapshot()).toEqual({ open: true, sectionId: 'shortcuts' });
    let changes = 0;
    botSettings.subscribe(() => {
      changes += 1;
    });
    expect(press(document.body).defaultPrevented).toBe(true);
    expect(changes).toBe(0);
  });

  it('leaves the key alone outside Bot mode, over another dialog and for other combinations', () => {
    const { botSettings, setActive } = mount(false);
    expect(press(document.body).defaultPrevented).toBe(false);
    setActive(true);
    const dialog = document.body.appendChild(document.createElement('div'));
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    expect(press(document.body).defaultPrevented).toBe(false);
    dialog.remove();
    press(document.body, { altKey: true });
    press(document.body, { repeat: true });
    press(document.body, { ctrlKey: false });
    expect(botSettings.getSnapshot().open).toBe(false);
    dispose();
    press(document.body);
    expect(botSettings.getSnapshot().open).toBe(false);
  });
});
