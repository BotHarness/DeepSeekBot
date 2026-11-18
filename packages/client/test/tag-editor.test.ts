// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

import { zhTranslate } from '../src/client/locale.js';
import { TagEditor } from '../src/client/tag-editor.js';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('ignores Enter while an IME composition is active and commits on a plain Enter', async () => {
  const onTags = vi.fn();
  const onDraft = vi.fn();
  await act(async () =>
    root.render(
      createElement(TagEditor, {
        id: 'tags',
        tags: ['研究员'],
        draft: '写作',
        disabled: false,
        t: zhTranslate,
        onTags,
        onDraft,
      }),
    ),
  );
  const input = host.querySelector('input')!;
  await act(async () => {
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
    );
  });
  expect(onTags).not.toHaveBeenCalled();
  expect(onDraft).not.toHaveBeenCalled();
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(onTags).toHaveBeenCalledWith(['研究员', '写作']);
  expect(onDraft).toHaveBeenCalledWith('');
});
