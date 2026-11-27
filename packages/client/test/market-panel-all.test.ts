// @vitest-environment jsdom
import { entry, withPanel } from './market-panel-fixtures.js';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketplaceSkill } from '@botharness/host-protocol/marketplace-skill';
import { zhTranslate } from '../src/client/locale.js';

const skill: MarketplaceSkill = {
  id: 'a'.repeat(24),
  name: 'tidy-notes',
  description: 'Keep meeting notes tidy.',
  owner: 'carol',
  repo: 'skills',
  fullName: 'carol/skills',
  path: 'tidy-notes',
  htmlUrl: `https://github.com/carol/skills/tree/${'b'.repeat(40)}/tidy-notes`,
  commitSha: 'b'.repeat(40),
  stars: 3,
  installs: 2,
  scripts: [],
  scan: 'clean',
  findings: [],
  fileCount: 1,
  size: 120,
  official: false,
  pushedAt: '2026-11-01T00:00:00Z',
};

const avatar = {
  id: 'avatar-a',
  imageUrl: 'https://market.test/avatara.png',
  name: 'Otter',
  description: 'River',
  tags: [],
  author: { id: 'k7m2pq', name: 'Alice' },
  applyCount: 0,
};

const hot = (names: string[]) => [
  {
    section: 'hot',
    day: '2026-11-28',
    entries: names.map((name, index) => ({ bot: entry(name), score: names.length - index })),
  },
];

function sources(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    marketplaceSections: vi.fn(async () => hot(['writer', 'coder', 'tutor', 'poet', 'chef'])),
    marketplaceSkillList: vi.fn(async () => ({ skills: [skill], nextCursor: null })),
    marketplaceAvatarList: vi.fn(async () => ({ avatars: [avatar], nextCursor: null })),
    connectors: vi.fn(async () => ({
      configured: true,
      accounts: [],
      catalog: [{ service: 'notion', name: 'Notion', summary: 'Pages and databases' }],
    })),
    ...overrides,
  };
}

const cards = (kind: string) =>
  [...document.body.querySelectorAll(`[data-market-all-section="${kind}"] li`)].map(
    (card) => card.textContent,
  );

describe('Marketplace All tab (#5441)', () => {
  it('opens first and shows every type with a type label on each card', async () => {
    const extra = sources();
    await withPanel(
      async () => ({ bots: [] }),
      async () => {
        const tab = document.getElementById('bh-market-section-all')!;
        expect(tab.getAttribute('aria-selected')).toBe('true');
        expect(
          [...document.body.querySelectorAll('[data-market-all-section]')].map((section) =>
            section.getAttribute('data-market-all-section'),
          ),
        ).toEqual(['bots', 'skills', 'apps', 'avatars']);
        expect(cards('bots')).toHaveLength(4);
        expect(cards('bots')[0]).toContain('Bot · alice');
        expect(cards('skills')[0]).toContain('Skill · carol/skills');
        expect(cards('apps')[0]).toContain('应用连接 · Composio');
        expect(cards('avatars')[0]).toContain('头像 · Alice');
        expect(extra.marketplaceAvatarList).toHaveBeenCalledWith({ sort: 'hot' });
      },
      extra,
      'all',
    );
  });

  it('opens a Bot from its card and switches tabs from See all', async () => {
    await withPanel(
      async () => ({ bots: [] }),
      async ({ actions }) => {
        const card = document.body.querySelector<HTMLButtonElement>(
          '[data-market-all-card="bot"] button',
        )!;
        await act(async () => card.click());
        expect(actions['telemetryEvent']).toHaveBeenCalledWith('marketplace:bot_open', {
          entry: 'hot',
          step: 'detail',
        });
        expect(document.getElementById('bh-market-section-all-panel')!.hidden).toBe(true);
      },
      sources(),
      'all',
    );
    await withPanel(
      async () => ({ bots: [] }),
      async () => {
        await act(async () =>
          document.body.querySelector<HTMLButtonElement>('[data-market-see-all="skills"]')!.click(),
        );
        expect(
          document.getElementById('bh-market-section-skills')!.getAttribute('aria-selected'),
        ).toBe('true');
        expect(document.body.querySelector('[data-market-all]')).toBeNull();
      },
      sources(),
      'all',
    );
  });

  it('keeps the other types when one source fails, and offers a retry when all fail', async () => {
    await withPanel(
      async () => ({ bots: [] }),
      async () => {
        expect(document.body.querySelector('[data-market-all-section="skills"]')).toBeNull();
        expect(cards('bots')).toHaveLength(4);
      },
      sources({ marketplaceSkillList: vi.fn(async () => Promise.reject(new Error('offline'))) }),
      'all',
    );
    const down = vi.fn(async () => Promise.reject(new Error('offline')));
    await withPanel(
      async () => ({ bots: [] }),
      async ({ host }) => {
        expect(host.textContent).toContain(zhTranslate('market.all.failed'));
      },
      sources({
        marketplaceSections: down,
        marketplaceSkillList: down,
        marketplaceAvatarList: down,
        connectors: down,
      }),
      'all',
    );
  });
});
