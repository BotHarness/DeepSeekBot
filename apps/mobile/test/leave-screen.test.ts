import { describe, expect, it, vi } from 'vitest';

import { leaveScreen } from '../src/ui/shell/leave-screen';

function fakeRouter(canGoBack: boolean) {
  return { canGoBack: () => canGoBack, back: vi.fn(), replace: vi.fn() };
}

describe('leaveScreen', () => {
  it('goes back when the stack has history', () => {
    const router = fakeRouter(true);
    leaveScreen(router);
    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('lands on the chat list when there is nothing to go back to', () => {
    const router = fakeRouter(false);
    leaveScreen(router);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
