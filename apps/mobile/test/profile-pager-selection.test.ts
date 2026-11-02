import { expect, it } from 'vitest';
import { createProfilePagerSelection } from '../src/ui/chat/profile-pager-selection';

it('keeps the latest pressed tab while earlier native page completions arrive', () => {
  const pages = createProfilePagerSelection('memory');
  expect(pages.choose('work')).toBe(true);
  expect(pages.choose('settings')).toBe(true);
  expect(pages.settle('work')).toBe(false);
  expect(pages.choose('work')).toBe(true);
  expect(pages.settle('settings')).toBe(false);
  expect(pages.settle('work')).toBe(true);
  expect(pages.choose('work')).toBe(false);
});

it('lets a real drag interrupt a requested page and return to the settled page', () => {
  const pages = createProfilePagerSelection('work');
  pages.choose('settings');
  expect(pages.drag()).toBe('work');
  expect(pages.settle('memory')).toBe(true);
  expect(pages.drag()).toBe('memory');
});

it('accepts a completed swipe or remembered tab without replaying its native navigation', () => {
  const pages = createProfilePagerSelection('members');
  expect(pages.settle('files')).toBe(true);
  expect(pages.choose('files')).toBe(false);
  expect(pages.choose('settings')).toBe(true);
  expect(pages.settle('settings')).toBe(true);
  expect(pages.choose('settings')).toBe(false);
});
