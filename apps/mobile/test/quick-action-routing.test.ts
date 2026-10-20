import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-quick-actions', () => ({ initial: undefined, addListener: () => ({ remove() {} }) }));
vi.mock('expo-router', () => ({ router: { navigate: vi.fn() } }));

const { quickActionHref } = await import('../src/ui/shell/quick-action-routing');

describe('home-screen shortcut routing', () => {
  it('opens only in-app paths', () => {
    expect(quickActionHref({ id: 'a', title: 'A', params: { href: '/dm/writer' } })).toBe(
      '/dm/writer',
    );
    expect(
      quickActionHref({ id: 'a', title: 'A', params: { href: 'https://example.com' } }),
    ).toBeUndefined();
    expect(quickActionHref({ id: 'a', title: 'A', params: { href: '//evil' } })).toBeUndefined();
    expect(quickActionHref({ id: 'a', title: 'A' })).toBeUndefined();
    expect(quickActionHref(undefined)).toBeUndefined();
  });
});
