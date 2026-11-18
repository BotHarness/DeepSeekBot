// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { comboboxPrimitives, dialogPrimitives } = await import('./primitive-mocks.js');
  const { createElement: h } = await import('react');
  const pass = ({ children }: { children?: unknown }) => h('span', null, children as never);
  return {
    ...comboboxPrimitives(),
    ...dialogPrimitives(),
    Tag: pass,
    Tooltip: pass,
    IconCheckOutlineRegular: () => null,
    IconInfoOutlineRegular: () => null,
  };
});

import type { PromptPresets } from '@botharness/host-client/prompt-presets';
import { zhTranslate as t } from '../src/client/locale.js';
import { PromptPresetSettings } from '../src/client/prompt-preset-settings.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
});

it('reads the Host again when the window comes back, so a phone change shows', async () => {
  let presets: PromptPresets = {
    presets: [
      { id: 'concise', name: 'Concise', revision: 1, parts: {}, limits: {}, updatedAt: '' },
    ],
    globalPresetId: null,
  };
  const promptPresets = vi.fn(async () => presets);
  const actions = {
    promptParts: async () => ({ parts: [], limits: [] }),
    promptPresets,
  };
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(createElement(PromptPresetSettings, { actions, t })));
  await act(async () => undefined);
  const concise = () => host.querySelector('[data-prompt-preset="concise"]')!.textContent;
  expect(concise()).not.toContain(t('prompts.globalTag'));

  presets = { ...presets, globalPresetId: 'concise' };
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => undefined);
  expect(promptPresets).toHaveBeenCalledTimes(2);
  expect(concise()).toContain(t('prompts.globalTag'));
});
