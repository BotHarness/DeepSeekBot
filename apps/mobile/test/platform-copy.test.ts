import { describe, expect, it } from 'vitest';

import { controlCase as android } from '../src/ui/platform-copy';
import { controlCase as ios, tapVerb } from '../src/ui/platform-copy.ios';

describe('platform control case', () => {
  it('uses Apple title case for iOS controls', () => {
    expect(ios('Track latest request')).toBe('Track Latest Request');
    expect(ios('Allow once')).toBe('Allow Once');
    expect(ios('Pair a new computer')).toBe('Pair a New Computer');
    expect(ios('Search Bots and Channels')).toBe('Search Bots and Channels');
    expect(ios('Join by link or QR')).toBe('Join by Link or QR');
  });

  it('keeps product spellings and Chinese as written', () => {
    expect(ios('Open in iPhone settings')).toBe('Open in iPhone Settings');
    expect(ios('跟踪最新请求')).toBe('跟踪最新请求');
    expect(ios('Bot 设置')).toBe('Bot 设置');
  });

  it('keeps sentence case on Android and names the platform tap verb', () => {
    expect(android('Track latest request')).toBe('Track latest request');
    expect(tapVerb.zh).toBe('轻点');
  });
});
