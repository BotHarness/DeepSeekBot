// @vitest-environment jsdom
import {
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    icon: _icon,
    ...props
  }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { icon?: unknown }>) =>
    createElement('button', props, children),
  FileTypeIcon: () => null,
  IconCloseOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconAgentPresetOutlineRegular: () => null,
  IconCodeOutlineRegular: () => null,
  IconBranchOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  IconPaperclipOutlineRegular: () => null,
  IconSendOutlineRegular: () => null,
  IconStopFillRegular: () => null,
  ImageLightbox: () => null,
  fileSizeText: (size: number) => `${size} B`,
}));

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { ChannelComposer, type ChannelComposerStop } from '../src/client/channel-composer.js';
import { stoppableBots } from '../src/client/composer-stop.js';
import { zhTranslate } from '../src/client/locale.js';
import { createStore } from '../src/client/store.js';

const render = (value: string, stop: ChannelComposerStop | undefined) =>
  renderToStaticMarkup(
    createElement(ChannelComposer, {
      value,
      placeholder: 'Message Ada',
      sending: false,
      stop,
      t: zhTranslate,
      onChange: () => undefined,
      onSubmit: () => undefined,
    }),
  );

describe('Stop in the composer', () => {
  it('turns the empty Send button into Stop while a Bot works', () => {
    const stop = { label: 'Stop Ada', stopping: false, onStop: () => undefined };
    const empty = render('', stop);
    expect(empty).toContain('aria-label="Stop Ada"');
    expect(empty).not.toContain('aria-label="发送"');

    const typing = render('also check the tests', stop);
    expect(typing).toContain('aria-label="发送"');
    expect(typing).not.toContain('Stop Ada');

    const stopping = render('', { ...stop, stopping: true });
    expect(stopping).toContain('aria-label="正在停止…"');
    expect(stopping).toMatch(/aria-busy="true"[^>]*disabled=""/u);

    const idle = render('', {
      stopping: false,
      notice: 'Ada has no running turn to stop',
      onStop: () => undefined,
    });
    expect(idle).toContain('aria-label="发送"');
    expect(idle).toContain('Ada has no running turn to stop');
  });

  it('offers only thinking or working Bots that are not paused', () => {
    expect(
      stoppableBots([
        { slug: 'ada', name: 'Ada', paused: false, state: 'working' },
        { slug: 'ben', name: 'Ben', paused: false, state: 'thinking' },
        { slug: 'cy', name: 'Cy', paused: false, state: 'waiting' },
        { slug: 'dee', name: 'Dee', paused: true, state: 'working' },
        { slug: 'eve', name: 'Eve', paused: false, state: 'idle' },
      ]),
    ).toEqual([
      { slug: 'ada', name: 'Ada' },
      { slug: 'ben', name: 'Ben' },
    ]);
  });

  it('calls channelBotStop and reports a Bot with no running turn', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let working = true;
    const call: BridgeCall = async (endpoint, payload) => {
      calls.push({ endpoint, payload });
      if (endpoint === 'channelBotStop') {
        if (!working)
          return {
            ok: false,
            error: { code: 'not-working', message: 'Ada is not working', details: {} },
          };
        working = false;
        return {
          ok: true,
          value: { stopped: { botSlug: 'ada', sessionId: 's-1', messageId: 'turn-stopped-1' } },
        };
      }
      return { ok: false, error: { code: 'unavailable', message: endpoint, details: {} } };
    };
    const actions = createActions(call, createStore(), undefined, undefined);

    await expect(actions.stopBot('dm-ada', 'ada')).resolves.toBe('stopped');
    await expect(actions.stopBot('dm-ada', 'ada')).resolves.toBe('not-working');
    expect(calls.filter((item) => item.endpoint === 'channelBotStop')).toEqual([
      { endpoint: 'channelBotStop', payload: { channelId: 'dm-ada', botSlug: 'ada' } },
      { endpoint: 'channelBotStop', payload: { channelId: 'dm-ada', botSlug: 'ada' } },
    ]);
  });
});
