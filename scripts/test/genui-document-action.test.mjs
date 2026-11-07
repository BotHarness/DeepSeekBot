import { describe, expect, it, vi } from 'vitest';
import { clickGenuiDocumentAction, fillGenuiDocumentFilter } from '../genui-document-action.mjs';

describe('trusted document action in a virtualized conversation', () => {
  it('fills the visible filter rather than manufacturing a bridge-only state', async () => {
    const fill = vi.fn().mockResolvedValue(undefined);
    const locator = vi.fn().mockReturnValue({ fill });
    const frame = { locator, $eval: vi.fn().mockResolvedValue('Retained draft') };
    await fillGenuiDocumentFilter(frame, 'Retained draft');
    expect(locator).toHaveBeenCalledWith('#filter');
    expect(fill).toHaveBeenCalledWith('Retained draft');
    expect(frame.$eval).toHaveBeenCalledWith('#filter', expect.any(Function));
  });

  it('refuses a bridge state whose rendered input still shows an older value', async () => {
    const frame = { locator: () => ({ fill: async () => undefined }), $eval: async () => 'Alpha' };
    await expect(fillGenuiDocumentFilter(frame, 'Retained draft')).rejects.toThrow(
      'Visible filter',
    );
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
