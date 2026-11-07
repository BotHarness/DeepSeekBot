import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  openTimelineConversation,
  revealEarlierTimelineMessage,
  timelineConversationVisible,
} from '../perf-timeline-navigation.mjs';

afterEach(() => vi.unstubAllGlobals());

describe('retained message navigation', () => {
  it('scrolls back to a virtualized older document instead of waiting at the latest edge', async () => {
    let steps = 0;
    const reveal = vi.fn();
    const page = {
      $: vi.fn(async () => (steps >= 3 ? { evaluate: reveal } : null)),
      $eval: vi.fn(async () => {
        steps++;
      }),
    };
    await revealEarlierTimelineMessage(page, '[data-message-id="older"]');
    expect(steps).toBe(3);
    expect(reveal).toHaveBeenCalledOnce();
    expect(page.$).toHaveBeenLastCalledWith('[data-message-id="older"]');
  });
  it('does not scroll when the exact retained document is mounted', async () => {
    const page = { $: vi.fn(async () => ({ evaluate: vi.fn() })), $eval: vi.fn() };
    await revealEarlierTimelineMessage(page, '[data-message-id="older"]');
    expect(page.$eval).not.toHaveBeenCalled();
  });
  it('fails boundedly instead of accepting a missing historical message', async () => {
    const page = { $: vi.fn(async () => null), $eval: vi.fn(async () => undefined) };
    await expect(revealEarlierTimelineMessage(page, '[data-message-id="missing"]')).rejects.toThrow(
      'Earlier message did not mount',
    );
    expect(page.$eval).toHaveBeenCalledTimes(30);
  });
});

describe('actual conversation visibility', () => {
  function pageWithPane({
    bounds = { left: 0, top: 0, right: 800, bottom: 1000 },
    covered = false,
    mounted = true,
  } = {}) {
    const content = {};
    const pane = { getBoundingClientRect: () => bounds, contains: (node) => node === content };
    vi.stubGlobal('innerWidth', 800);
    vi.stubGlobal('innerHeight', 1100);
    vi.stubGlobal('document', {
      querySelector: () => (mounted ? pane : null),
      elementFromPoint: () => (covered ? {} : content),
    });
    return { evaluate: async (callback) => callback() };
  }

  it('requires the conversation to be in the viewport and frontmost', async () => {
    await expect(timelineConversationVisible(pageWithPane())).resolves.toBe(true);
  });

  it.each([
    { mounted: false },
    { covered: true },
    { bounds: { left: 800, top: 0, right: 1600, bottom: 1000 } },
    { bounds: { left: 0, top: 0, right: 0, bottom: 0 } },
    { bounds: { left: 0, top: 1100, right: 800, bottom: 2100 } },
  ])('does not count hidden/mounted DOM as screenshot evidence: %j', async (state) => {
    await expect(timelineConversationVisible(pageWithPane(state))).resolves.toBe(false);
  });
});

function fixture({
  active = true,
  listVisible = true,
  rail = true,
  hiddenFirst = false,
  empty = false,
} = {}) {
  const clicks = [];
  const row = `${rail ? '[data-workspace-dock] ' : ''}button[data-channel-id="group"]`;
  const page = {
    $: vi.fn(async (selector) => {
      if (selector === '.bh-root.bh-main, [data-workspace-dock]') return active ? {} : null;
      if (selector === '[data-workspace-dock]') return rail ? {} : null;
      if (selector === row) return listVisible ? { isVisible: async () => true } : null;
      if (selector === '[data-workspace-dock] button[aria-label="Channels"]') return null;
      if (selector === '[data-workspace-dock] button[data-pinned-panel="bh:channels"]' && rail)
        return {
          click: async () => {
            clicks.push('Channels');
            listVisible = !listVisible;
          },
        };
      if (selector === '[data-workspace-dock] button[aria-label="Messages"]' && rail)
        return { click: async () => clicks.push('Messages') };
      throw new Error(`Unexpected selector: ${selector}`);
    }),
    waitForSelector: vi.fn(async (selector) => {
      if (empty && selector.includes('[data-message-id]')) throw new Error('Conversation is empty');
      if (selector === '.bh-root.bh-main, [data-workspace-dock]') expect(active).toBe(true);
      if (selector === row) expect(listVisible).toBe(true);
    }),
    waitForFunction: vi.fn(async (_predicate, _options, selector) => {
      expect(selector).toBe(row);
      expect(listVisible).toBe(true);
    }),
    $$: vi.fn(async (selector) => {
      expect(selector).toBe(row);
      expect(listVisible).toBe(true);
      return [
        ...(hiddenFirst
          ? [
              {
                isVisible: async () => false,
                click: async () => {
                  throw new Error('Hidden row clicked');
                },
              },
            ]
          : []),
        {
          isVisible: async () => true,
          click: async () => {
            clicks.push(row);
          },
        },
      ];
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
  it('opens an empty DM before its first publication', async () => {
    const { page } = fixture({ empty: true });
    await expect(openTimelineConversation(page, 'group', vi.fn())).resolves.toBeUndefined();
  });
  it('navigates via the visible row without requiring the hidden conversation shell', async () => {
    const { page, clicks } = fixture();
    const wait = page.waitForSelector;
    page.waitForSelector = vi.fn(async (selector, options) => {
      if (selector === '.bh-root.bh-main, [data-workspace-dock]')
        expect(options?.visible).not.toBe(true);
      await wait(selector);
    });
    await openTimelineConversation(page, 'group', vi.fn());
    expect(clicks).toContain('[data-workspace-dock] button[data-channel-id="group"]');
  });

  it('recognizes an active workspace without looking for the hidden Bot mode entry', async () => {
    const { page, clicks } = fixture();
    await openTimelineConversation(page, 'group', vi.fn());
    expect(clicks).toEqual(['[data-workspace-dock] button[data-channel-id="group"]']);
  });

  it('opens a hidden list by panel ID when the Channels label includes a shortcut', async () => {
    const { page, clicks } = fixture({ listVisible: false });
    await openTimelineConversation(page, 'group', vi.fn());
    expect(clicks).toEqual(['Channels', '[data-workspace-dock] button[data-channel-id="group"]']);
  });

  it('enters Bot mode only when neither shell is mounted', async () => {
    const { page, clicks } = fixture({ active: false, rail: false });
    await openTimelineConversation(page, 'group', vi.fn());
    expect(clicks).toEqual(['::-p-aria(Bot mode)', 'button[data-channel-id="group"]']);
  });

  it('skips a hidden legacy row when a visible DM contact shares the channel ID', async () => {
    const { page, clicks } = fixture({ hiddenFirst: true });
    await openTimelineConversation(page, 'group', vi.fn());
    expect(clicks).toEqual(['[data-workspace-dock] button[data-channel-id="group"]']);
  });
});
