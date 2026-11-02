// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { followAvatar, followDistance } from '../src/client/avatar-follow.js';

function group(boxes: Array<{ offsetTop: number; offsetHeight: number }>): HTMLElement {
  const root = document.createElement('div');
  const avatar = document.createElement('span');
  const stack = document.createElement('div');
  stack.className = 'bh-message-stack';
  for (const box of boxes) {
    const wrap = document.createElement('div');
    wrap.className = 'bh-bubble-wrap';
    Object.defineProperty(wrap, 'offsetTop', { value: box.offsetTop });
    Object.defineProperty(wrap, 'offsetHeight', { value: box.offsetHeight });
    stack.append(wrap);
  }
  root.append(avatar, stack);
  document.body.append(root);
  return avatar;
}

afterEach(() => {
  document.body.replaceChildren();
  delete document.documentElement.dataset['botharnessMotion'];
});

describe('avatar follow', () => {
  it('measures from the previous bubble bottom to the new one', () => {
    expect(
      followDistance({ offsetTop: 20, offsetHeight: 44 }, { offsetTop: 68, offsetHeight: 60 }),
    ).toBe(64);
  });

  it('slides the avatar down from the previous bubble to the newest one', () => {
    const avatar = group([
      { offsetTop: 20, offsetHeight: 44 },
      { offsetTop: 68, offsetHeight: 44 },
    ]);
    const animate = vi.fn();
    avatar.animate = animate;
    followAvatar(avatar);
    expect(animate).toHaveBeenCalledWith(
      [{ transform: 'translateY(-48px)' }, { transform: 'none' }],
      expect.objectContaining({ duration: 220 }),
    );
  });

  it('stays put for a single bubble or reduced motion', () => {
    const single = group([{ offsetTop: 20, offsetHeight: 44 }]);
    single.animate = vi.fn();
    followAvatar(single);
    expect(single.animate).not.toHaveBeenCalled();
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    const reduced = group([
      { offsetTop: 20, offsetHeight: 44 },
      { offsetTop: 68, offsetHeight: 44 },
    ]);
    reduced.animate = vi.fn();
    followAvatar(reduced);
    expect(reduced.animate).not.toHaveBeenCalled();
  });
});
