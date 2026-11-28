// @vitest-environment jsdom
import { entry, withPanel } from './market-panel-fixtures.js';
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketplaceSkill } from '@botharness/host-protocol/marketplace-skill';
import { BridgeCallError } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { groupAddedSkills, targetLabels } from '../src/client/market-yours.js';

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

  it('shows a failed type with its reason and Retry next to the types that loaded', async () => {
    const skills = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ skills: [skill], nextCursor: null });
    await withPanel(
      async () => ({ bots: [] }),
      async () => {
        const failed = document.body.querySelector('[data-market-all-section="skills"]')!;
        expect(failed.textContent).toContain(
          zhTranslate('market.error.load', { error: 'offline' }),
        );
        expect(cards('bots')).toHaveLength(4);
        await act(async () =>
          [...failed.querySelectorAll('button')]
            .find((node) => node.textContent === zhTranslate('market.retry'))!
            .click(),
        );
        expect(cards('skills')[0]).toContain('Skill · carol/skills');
      },
      sources({ marketplaceSkillList: skills }),
      'all',
    );
  });

  it('hides app connections for a viewer without permission but reports other connector failures', async () => {
    await withPanel(
      async () => ({ bots: [] }),
      async () => {
        expect(document.body.querySelector('[data-market-all-section="apps"]')).toBeNull();
      },
      sources({
        connectors: vi.fn(async () =>
          Promise.reject(new BridgeCallError('permission-required', 'owner only')),
        ),
      }),
      'all',
    );
    await withPanel(
      async () => ({ bots: [] }),
      async () => {
        expect(
          document.body.querySelector('[data-market-all-section="apps"]')?.textContent,
        ).toContain(zhTranslate('market.retry'));
      },
      sources({ connectors: vi.fn(async () => Promise.reject(new Error('offline'))) }),
      'all',
    );
  });

  it('keeps a page opened from Bots on the Bots tab', async () => {
    await withPanel(
      async () => ({ bots: [entry('helper')] }),
      async () => {
        await act(async () =>
          document.body
            .querySelector<HTMLButtonElement>('[data-market-bot="alice/helper"] button')!
            .click(),
        );
        expect(document.getElementById('bh-market-section-bots-panel')!.hidden).toBe(true);
        await act(async () => document.getElementById('bh-market-section-all')!.click());
        expect(document.getElementById('bh-market-section-all-panel')!.hidden).toBe(false);
        expect(cards('bots')).toHaveLength(4);
      },
      sources(),
    );
  });

  it('pins the added Skills and the connections that need reconnecting under Yours', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const reconnect = vi.fn(async () => ({
      account: { accountId: 'acc-1' },
      url: 'https://connect.test/sign-in',
    }));
    const detail = vi.fn(async () => ({ skill, content: '# Tidy', files: [] }));
    const extra = sources({
      marketplaceSkillAdded: vi.fn(async () => ({
        skills: [
          { id: skill.id, name: 'tidy-notes', description: '', target: 'helper', hash: 'h' },
          { id: skill.id, name: 'tidy-notes', description: '', target: 'global', hash: 'h' },
        ],
      })),
      marketplaceSkillAddCandidates: vi.fn(async () => ({
        bots: [{ slug: 'helper', displayName: 'Helper' }],
        global: true,
      })),
      marketplaceSkillDetail: detail,
      connectorReconnect: reconnect,
      connectors: vi.fn(async () => ({
        configured: true,
        accounts: [
          { accountId: 'acc-1', service: 'gmail', name: 'Gmail', status: 'expired', grants: [] },
          { accountId: 'acc-2', service: 'notion', name: 'Notion', status: 'active', grants: [] },
        ],
        catalog: [],
      })),
    });
    try {
      await withPanel(
        async () => ({ bots: [] }),
        async () => {
          const yours = document.body.querySelector('[data-market-yours=""]')!;
          const rows = [...yours.querySelectorAll('li')].map((row) => row.textContent);
          expect(rows).toEqual([
            expect.stringContaining('应用连接 · 已过期'),
            expect.stringContaining('Skill · Helper、全局'),
          ]);
          expect(rows.join()).not.toContain('Notion');
          expect(
            document.body
              .querySelector('[data-market-all-section]')
              ?.compareDocumentPosition(yours),
          ).toBe(Node.DOCUMENT_POSITION_PRECEDING);

          await act(async () =>
            yours
              .querySelector<HTMLButtonElement>(
                `[aria-label="${zhTranslate('connectors.accounts.reconnect')} Gmail"]`,
              )!
              .click(),
          );
          expect(reconnect).toHaveBeenCalledWith('acc-1');
          expect(open).toHaveBeenCalledWith(
            'https://connect.test/sign-in',
            '_blank',
            'noopener,noreferrer',
          );

          await act(async () =>
            yours.querySelector<HTMLButtonElement>('[data-market-yours="skill"] button')!.click(),
          );
          expect(detail).toHaveBeenCalledWith(skill.id);
          expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
            'tidy-notes',
          );
        },
        extra,
        'all',
      );
    } finally {
      open.mockRestore();
    }
  });

  it('leaves Yours out when nothing is added and every connection works', async () => {
    await withPanel(
      async () => ({ bots: [] }),
      async () => {
        expect(document.body.querySelector('[data-market-all-section="bots"]')).not.toBeNull();
        expect(document.body.querySelector('[data-market-yours=""]')).toBeNull();
      },
      sources(),
      'all',
    );
  });

  it('keeps every Bot an added Skill lives in, even when two Bots share a name', () => {
    const added = (target: string) => ({
      id: skill.id,
      name: 'tidy-notes',
      description: '',
      target,
      hash: 'h',
    });
    const grouped = groupAddedSkills([
      added('helper-a'),
      added('helper-b'),
      added('helper-a'),
      added('global'),
    ]);
    expect(grouped).toEqual([
      { id: skill.id, name: 'tidy-notes', targets: ['helper-a', 'helper-b', 'global'] },
    ]);
    const names = new Map([
      ['helper-a', 'Helper'],
      ['helper-b', 'Helper'],
      ['solo', 'Solo'],
    ]);
    expect(
      grouped[0]!.targets.map(targetLabels(names, zhTranslate('market.skills.globalShort'))),
    ).toEqual(['Helper (helper-a)', 'Helper (helper-b)', zhTranslate('market.skills.globalShort')]);
    expect(targetLabels(names, 'Global')('solo')).toBe('Solo');
    expect(targetLabels(names, 'Global')('global')).toBe('Global');
  });
});
