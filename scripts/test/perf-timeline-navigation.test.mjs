import { describe, expect, it, vi } from 'vitest';
import { openTimelineConversation } from '../perf-timeline-navigation.mjs';

function fixture({ active = true, listVisible = true, rail = true } = {}) {
  const clicks = [];
  const row = `${rail ? '[data-workspace-dock] ' : ''}button.bh-channel-row[data-channel-id="group"]`;
  const page = {
    $: vi.fn(async (selector) => {
      if (selector === '.bh-root.bh-main, [data-workspace-dock]') return active ? {} : null;
      if (selector === '[data-workspace-dock]') return rail ? {} : null;
      if (selector === row) return listVisible ? { isVisible: async () => true } : null;
      if (selector === '[data-workspace-dock] button[aria-label="Messages"]' && rail)
        return {
          click: async () => {
            clicks.push('Messages');
            listVisible = !listVisible;
          },
        };
      throw new Error(`Unexpected selector: ${selector}`);
    }),
    waitForSelector: vi.fn(async (selector) => {
      if (selector === '.bh-root.bh-main, [data-workspace-dock]') expect(active).toBe(true);
      if (selector === row) expect(listVisible).toBe(true);
    }),
    locator: (selector) => ({
      click: async () => {
        if (selector === '::-p-aria(Bot mode)') {
          expect(active).toBe(false);
          active = true;
        } else {
          expect(selector).toBe(row);
          expect(listVisible).toBe(true);
        }
        clicks.push(selector);
      },
    }),
  };
  return { page, clicks };
}

describe('timeline performance navigation', () => {
  it('recognizes an active workspace without looking for the hidden Bot mode entry', async () => {
    const { page, clicks } = fixture();
    await openTimelineConversation(page, 'group', vi.fn());
    expect(clicks).toEqual([
      '[data-workspace-dock] button.bh-channel-row[data-channel-id="group"]',
    ]);
  });

  it('opens a hidden list without toggling an already visible list closed', async () => {
    const { page, clicks } = fixture({ listVisible: false });
    await openTimelineConversation(page, 'group', vi.fn());
    expect(clicks).toEqual([
      'Messages',
      '[data-workspace-dock] button.bh-channel-row[data-channel-id="group"]',
    ]);
  });

  it('enters Bot mode only when neither shell is mounted', async () => {
    const { page, clicks } = fixture({ active: false, rail: false });
    await openTimelineConversation(page, 'group', vi.fn());
    expect(clicks).toEqual([
      '::-p-aria(Bot mode)',
      'button.bh-channel-row[data-channel-id="group"]',
    ]);
  });
});
