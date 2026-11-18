// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return new Proxy(
    {},
    {
      get: (_target, key) => (key === 'then' ? undefined : stub),
      has: () => true,
    },
  );
});

import { botModeActions, parseBotModesView } from '../src/client/bot-mode-actions.js';
import { BotModeSettingsEntry } from '../src/client/bot-mode-settings.js';
import { zhTranslate } from '../src/client/locale.js';

const VIEW = {
  modes: [{ id: 'deepseekbot' }, { id: 'ptc' }],
  productDefault: 'deepseekbot',
  globalDefault: null,
  effectiveDefault: 'deepseekbot',
  templates: [{ id: 't1', name: 'Coding', modes: ['ptc'] }],
  bot: { slug: 'ada', mode: null, effective: 'ptc', template: 't1', allowed: ['ptc'] },
};

describe('Bot mode actions', () => {
  it('rejects a response for another Bot or with malformed policy fields', async () => {
    const reply = (value: unknown) => botModeActions(async () => ({ ok: true, value }) as never);
    await expect(reply(VIEW).botModes('ada')).resolves.toMatchObject({ bot: { slug: 'ada' } });
    await expect(reply(VIEW).botModes('bob')).rejects.toThrow(/invalid botModes/);
    await expect(reply({ ...VIEW, bot: undefined }).botModes('ada')).rejects.toThrow();
    await expect(
      reply({ ...VIEW, bot: { ...VIEW.bot, allowed: ['ptc', 1] } }).botModes('ada'),
    ).rejects.toThrow();
    expect(() => parseBotModesView({ ...VIEW, templates: [{ id: 't1' }] }, 'botModes')).toThrow();
    expect(
      parseBotModesView({ ...VIEW, templates: [], bot: undefined }, 'botModes').templates,
    ).toEqual([]);
  });
});

describe('Bot mode page', () => {
  let root: Root | undefined;
  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
  });

  it('reads the modes once and does not read again after the view settles', async () => {
    const botModes = vi.fn(async () => parseBotModesView(VIEW, 'botModes', 'ada'));
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        createElement(BotModeSettingsEntry, {
          botSlug: 'ada',
          actions: { botModes, setBotMode: vi.fn() },
          t: zhTranslate,
        } as never),
      );
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(host.querySelector('[data-bot-mode-settings]')).not.toBeNull();
    expect(botModes).toHaveBeenCalledTimes(1);
  });
});
