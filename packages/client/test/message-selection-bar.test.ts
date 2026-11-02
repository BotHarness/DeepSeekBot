// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return {
    ...dialogPrimitives(),
    Menu: ({ anchor }: { anchor: React.ReactNode }) => anchor,
    IconDownloadOutlineRegular: () => null,
    IconCopyOutlineRegular: () => null,
    IconInspectOutlineRegular: () => null,
    IconShareOutlineRegular: () => null,
  };
});
import { MessageSelectionBar } from '../src/client/message-selection.js';
import { zhTranslate } from '../src/client/locale.js';
it('offers direct copy and screenshot actions, then cancels with Escape', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const onExport = vi.fn();
  const onCancel = vi.fn();
  await act(async () =>
    root.render(
      createElement(MessageSelectionBar, {
        count: 2,
        busy: false,
        t: zhTranslate,
        onExport,
        onCancel,
      }),
    ),
  );
  try {
    const buttons = Array.from(container.querySelectorAll('button'));
    const copy = buttons.find((b) => b.textContent === '复制');
    const image = buttons.find((b) => b.textContent === '截图');
    expect(copy).toBeDefined();
    expect(image).toBeDefined();
    await act(async () => {
      copy!.click();
      image!.click();
    });
    expect(onExport.mock.calls).toEqual([['conversation'], ['image']]);
    expect(container.textContent).not.toContain('诊断');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onCancel).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
