import { describe, expect, it, vi } from 'vitest';
import {
  clickGenuiDocumentAction,
  fillGenuiDocumentFilter,
  waitForGenuiMirrorControl,
} from '../genui-document-action.mjs';

describe('trusted document action in a virtualized conversation', () => {
  it('polls native mirror controls from the trusted parent rather than the script-disabled frame', async () => {
    const waitForFunction = vi.fn().mockResolvedValue(undefined);
    await waitForGenuiMirrorControl({ waitForFunction }, 'section', '#filter', 'value', 'Beta');
    expect(waitForFunction).toHaveBeenCalledWith(
      expect.any(Function),
      {},
      'section',
      '#filter',
      'value',
      'Beta',
    );
    const predicate = waitForFunction.mock.calls[0][0];
    const control = { value: 'Beta' };
    vi.stubGlobal('document', {
      querySelector: (selector) =>
        selector === 'section iframe'
          ? { contentDocument: { querySelector: () => control } }
          : undefined,
    });
    try {
      expect(predicate('section', '#filter', 'value', 'Beta')).toBe(true);
      expect(predicate('section', '#filter', 'value', 'Alpha')).toBe(false);
      expect(predicate('missing', '#filter', 'value', 'Beta')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('fills the visible filter rather than manufacturing a bridge-only state', async () => {
    const input = { click: vi.fn(), type: vi.fn() };
    const keyboard = { press: vi.fn() };
    const frame = {
      $: vi.fn().mockResolvedValue(input),
      $eval: vi.fn().mockResolvedValue('Retained draft'),
      page: () => ({ keyboard }),
    };
    await fillGenuiDocumentFilter(frame, 'Retained draft');
    expect(frame.$).toHaveBeenCalledWith('#filter');
    expect(input.click).toHaveBeenCalledWith({ count: 3 });
    expect(keyboard.press).toHaveBeenCalledWith('Backspace');
    expect(input.type).toHaveBeenCalledWith('Retained draft', { delay: 60 });
    expect(input.click.mock.invocationCallOrder[0]).toBeLessThan(
      keyboard.press.mock.invocationCallOrder[0],
    );
    expect(keyboard.press.mock.invocationCallOrder[0]).toBeLessThan(
      input.type.mock.invocationCallOrder[0],
    );
    expect(frame.$eval).toHaveBeenCalledWith('#filter', expect.any(Function));
  });

  it('refuses a bridge state whose rendered input still shows an older value', async () => {
    const frame = {
      $: async () => ({
        click: async () => undefined,
        type: async () => undefined,
      }),
      page: () => ({ keyboard: { press: async () => undefined } }),
      $eval: async () => 'Alpha',
    };
    await expect(fillGenuiDocumentFilter(frame, 'Retained draft')).rejects.toThrow(
      'Visible filter',
    );
  });
  it('clears through the keyboard without typing an empty value', async () => {
    const input = { click: vi.fn(), type: vi.fn() };
    const keyboard = { press: vi.fn() };
    await fillGenuiDocumentFilter(
      { $: async () => input, $eval: async () => '', page: () => ({ keyboard }) },
      '',
    );
    expect(keyboard.press).toHaveBeenCalledWith('Backspace');
    expect(input.type).not.toHaveBeenCalled();
  });
  it('reacquires a stable exact named button within the canonical message', async () => {
    const click = vi.fn().mockResolvedValue(undefined);
    const locator = vi.fn().mockReturnValue({ click });
    await clickGenuiDocumentAction(
      { locator },
      '[data-message-id="canonical"] section',
      'Refresh document',
    );
    expect(locator).toHaveBeenCalledWith(
      '[data-message-id="canonical"] section ::-p-aria([name="Refresh document"][role="button"])',
    );
    expect(click).toHaveBeenCalledOnce();
  });

  it('retains an unavailable or non-clickable action as a failure', async () => {
    const target = {
      locator: () => ({
        click: async () => {
          throw new Error('not clickable');
        },
      }),
    };
    await expect(clickGenuiDocumentAction(target, 'section', 'Continue')).rejects.toThrow(
      'not clickable',
    );
  });
});
