import { describe, expect, it, vi } from 'vitest';
import { clickGenuiDocumentAction } from '../genui-document-action.mjs';

describe('trusted document action in a virtualized conversation', () => {
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
