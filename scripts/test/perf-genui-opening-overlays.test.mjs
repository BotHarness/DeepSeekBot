import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dismissGenuiOpeningOverlays,
  genuiOpeningOverlayControl,
} from '../perf-genui-opening-overlays.mjs';

afterEach(() => vi.unstubAllGlobals());

function control(label = 'Continue', options = {}) {
  return {
    isConnected: true,
    disabled: false,
    textContent: label,
    getAttribute: () => null,
    closest: () => null,
    checkVisibility: () => true,
    getBoundingClientRect: () => ({ width: 80, height: 32 }),
    ...options,
  };
}

function fixture(buttons, click = async () => buttons.shift()) {
  vi.stubGlobal('document', {
    querySelector: () => null,
    querySelectorAll: () => buttons,
  });
  const handles = [];
  const locator = { setTimeout: vi.fn(), click: vi.fn(click) };
  locator.setTimeout.mockReturnValue(locator);
  const page = {
    evaluateHandle: vi.fn(async (find) => {
      const node = find();
      const handle = { asElement: () => node, dispose: vi.fn() };
      handles.push(handle);
      return handle;
    }),
    locator: vi.fn((find) => {
      expect(find).toBe(genuiOpeningOverlayControl);
      return locator;
    }),
  };
  return { page, locator, handles };
}

describe('GenUI opening overlay dismissal', () => {
  it('re-resolves the visible control through a stable trusted-click locator', async () => {
    const { page, locator, handles } = fixture([control(), control('Configure later')]);
    await dismissGenuiOpeningOverlays(page);
    expect(locator.click).toHaveBeenCalledTimes(2);
    expect(locator.setTimeout).toHaveBeenCalledWith(2000);
    for (const handle of handles) expect(handle.dispose).toHaveBeenCalledOnce();
  });

  it('accepts an overlay disappearing before the trusted click without clicking another control', async () => {
    const buttons = [control()];
    const { page, locator } = fixture(buttons, async () => {
      buttons.length = 0;
      throw Object.assign(new Error('Control disappeared'), { name: 'TimeoutError' });
    });
    await dismissGenuiOpeningOverlays(page);
    expect(locator.click).toHaveBeenCalledOnce();
  });

  it('retains a click failure when the overlay is still present', async () => {
    const failure = new Error('Overlay remains blocked');
    const { page, locator } = fixture([control()], async () => {
      throw failure;
    });
    await expect(dismissGenuiOpeningOverlays(page)).rejects.toBe(failure);
    expect(locator.click).toHaveBeenCalledOnce();
  });

  it('does not suppress non-timeout click failures even if the overlay disappeared', async () => {
    const buttons = [control()];
    const failure = new Error('Browser disconnected');
    const { page } = fixture(buttons, async () => {
      buttons.length = 0;
      throw failure;
    });
    await expect(dismissGenuiOpeningOverlays(page)).rejects.toBe(failure);
  });

  it.each([
    { closest: () => ({}) },
    { disabled: true },
    { isConnected: false },
    { checkVisibility: () => false },
    { getBoundingClientRect: () => ({ width: 0, height: 32 }) },
    { getBoundingClientRect: () => ({ width: 80, height: 0 }) },
  ])('never clicks rich-document controls or unclickable overlay nodes: %j', async (options) => {
    const { page, locator } = fixture([control('Continue', options)]);
    await dismissGenuiOpeningOverlays(page);
    expect(locator.click).not.toHaveBeenCalled();
  });

  it('fails after the bounded dismissal count rather than claiming a clear shell', async () => {
    const { page, locator } = fixture([control()], async () => {});
    await expect(dismissGenuiOpeningOverlays(page)).rejects.toThrow('remain after 8');
    expect(locator.click).toHaveBeenCalledTimes(8);
  });
});
