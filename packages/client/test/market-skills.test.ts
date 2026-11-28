// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type {
  MarketplaceSkill,
  MarketplaceSkillReview,
} from '@botharness/host-protocol/marketplace-skill';
import { buttonNamed } from './primitive-mocks.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { createMarketplaceSkillActions } from '../src/client/features/marketplace/skill-actions.js';
import { MarketSkills } from '../src/client/market-skills.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives, shellPrimitives } = await import('./primitive-mocks.js');
  return { ...shellPrimitives(), ...dialogPrimitives() };
});

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
  scripts: ['scripts/fmt.py'],
  scan: 'clean',
  findings: [],
  fileCount: 2,
  size: 120,
  official: false,
  pushedAt: '2026-11-01T00:00:00Z',
};

const review: MarketplaceSkillReview = {
  reviewId: 'review-1',
  skill,
  verdict: 'clean',
  findings: [],
  scripts: ['scripts/fmt.py'],
  files: [
    { path: 'SKILL.md', size: 100 },
    { path: 'scripts/fmt.py', size: 20 },
  ],
  hash: 'c'.repeat(64),
  conflicts: { bots: ['ada'], global: false },
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function actionsFor() {
  return {
    marketplaceSkillList: vi.fn(async () => ({ skills: [skill], nextCursor: null })),
    marketplaceSkillDetail: vi.fn(async () => ({
      skill,
      content: '---\nname: tidy-notes\ndescription: x\n---\n\n# Tidy notes\n',
      files: review.files,
    })),
    marketplaceSkillAddCandidates: vi.fn(async () => ({
      bots: [
        { slug: 'ada', displayName: 'Ada' },
        { slug: 'bob', displayName: 'Bob' },
      ],
      global: true,
    })),
    marketplaceSkillReview: vi.fn(async () => review),
    marketplaceSkillReport: vi.fn(async () => undefined),
    marketplaceChallenge: vi.fn(async () => {
      throw new Error('unused');
    }),
    marketplaceSkillAdd: vi.fn(async () => ({
      name: 'tidy-notes',
      added: [
        { target: 'ada', name: 'tidy-notes-2', path: '.agents/skills/tidy-notes-2' },
        { target: 'global', name: 'tidy-notes', path: '/home/x/.dsh/skills/tidy-notes' },
      ],
    })),
  };
}

function checkbox(label: string): HTMLInputElement {
  const found = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  const input = found?.querySelector('input');
  if (!input) throw new Error(`No checkbox ${label}`);
  return input;
}

it('lists Skills with a scripts tag and opens SKILL.md, scripts and files', async () => {
  const actions = actionsFor();
  await act(async () => root.render(createElement(MarketSkills, { actions, t })));
  const card = host.querySelector('[data-market-skill="tidy-notes"]');
  expect(card?.textContent).toContain('carol/skills');
  expect(card?.textContent).toContain(t('market.skills.hasScripts'));
  expect(card?.textContent).toContain(t('market.skills.installs', { count: 2 }));
  await act(async () => buttonNamed('tidy-notescarol/skills').click());
  expect(actions.marketplaceSkillDetail).toHaveBeenCalledWith(skill.id);
  const detail = document.querySelector('[data-market-skill-detail="tidy-notes"]');
  expect(detail?.textContent).toContain('Tidy notes');
  expect(detail?.querySelector('[data-market-skill-scripts]')?.textContent).toBe('scripts/fmt.py');
  expect(detail?.textContent).toContain('SKILL.md');
});

it('reviews, picks Bots and global, renames on conflict and reports where it was added', async () => {
  const actions = actionsFor();
  await act(async () => root.render(createElement(MarketSkills, { actions, t })));
  await act(async () => buttonNamed('tidy-notescarol/skills').click());
  await act(async () => buttonNamed(t('market.skills.addOpen')).click());
  expect(actions.marketplaceSkillReview).toHaveBeenCalledWith(skill.id);
  expect(document.querySelector('[data-market-skill-review="clean"]')).toBeTruthy();
  expect(buttonNamed(t('market.skills.add')).disabled).toBe(true);
  await act(async () => checkbox(t('market.skills.botTaken', { name: 'Ada' })).click());
  await act(async () => checkbox(t('market.skills.global')).click());
  expect(document.body.textContent).toContain(t('market.skills.rename'));
  actions.marketplaceSkillDetail.mockResolvedValue({
    skill: { ...skill, installs: 3 },
    content: '',
    files: review.files,
  });
  await act(async () => buttonNamed(t('market.skills.add')).click());
  expect(actions.marketplaceSkillAdd).toHaveBeenCalledWith(
    skill.id,
    'review-1',
    { bots: ['ada'], global: true },
    'rename',
  );
  expect(document.body.textContent).toContain(
    t('market.skills.added', {
      name: 'tidy-notes',
      targets: `Ada (tidy-notes-2), ${t('market.skills.globalShort')}`,
    }),
  );
  expect(host.querySelector('[data-market-skill="tidy-notes"]')?.textContent).toContain(
    t('market.skills.installs', { count: 3 }),
  );
});

it('blocks adding a Skill that fails the Host scan and shows the finding', async () => {
  const actions = actionsFor();
  actions.marketplaceSkillReview.mockResolvedValue({
    ...review,
    verdict: 'blocked',
    findings: [{ kind: 'download-exec', path: 'setup.sh', line: 1, severity: 'malicious' }],
  });
  await act(async () => root.render(createElement(MarketSkills, { actions, t })));
  await act(async () => buttonNamed('tidy-notescarol/skills').click());
  await act(async () => buttonNamed(t('market.skills.addOpen')).click());
  expect(document.body.textContent).toContain(t('market.skills.blockedTitle'));
  expect(document.body.textContent).toContain('setup.sh:1');
  expect(buttonNamed(t('market.skills.add')).disabled).toBe(true);
});

it('shows a mapped error when the add fails', async () => {
  const actions = actionsFor();
  actions.marketplaceSkillAdd.mockRejectedValue(
    new BridgeCallError('skill-exists', 'skill-exists'),
  );
  await act(async () => root.render(createElement(MarketSkills, { actions, t })));
  await act(async () => buttonNamed('tidy-notescarol/skills').click());
  await act(async () => buttonNamed(t('market.skills.addOpen')).click());
  await act(async () => checkbox('Bob').click());
  await act(async () => buttonNamed(t('market.skills.add')).click());
  expect(document.body.textContent).toContain(t('market.error.skillExists'));
});

it('shows the hot, new and rising Skill rankings above the list and hides them while searching', async () => {
  const rising = { ...skill, id: 'd'.repeat(24), name: 'quick-diff' };
  const actions = {
    ...actionsFor(),
    marketplaceSkillSections: vi.fn(async () => [
      { section: 'hot' as const, entries: [{ skill, score: 5 }] },
      { section: 'new' as const, entries: [] },
      { section: 'rising' as const, entries: [{ skill: rising, score: 2 }] },
    ]),
  };
  await act(async () => root.render(createElement(MarketSkills, { actions, t })));
  expect(
    [...host.querySelectorAll('[data-market-skill-ranking]')].map((section) => [
      section.getAttribute('data-market-skill-ranking'),
      section.querySelector('h3')?.textContent,
      [...section.querySelectorAll('[data-market-skill]')].map((card) =>
        card.getAttribute('data-market-skill'),
      ),
    ]),
  ).toEqual([
    ['hot', t('market.section.hot'), ['tidy-notes']],
    ['rising', t('market.section.rising'), ['quick-diff']],
  ]);
  expect(host.textContent).toContain(t('market.skills.all'));
  await act(async () => buttonNamed('quick-diffcarol/skills').click());
  expect(actions.marketplaceSkillDetail).toHaveBeenCalledWith(rising.id);

  const search = host.querySelector<HTMLInputElement>('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(search, 'tidy');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('[data-market-skill-ranking]')).toBeNull();
});

it('leaves the rankings out when the Host has none or no rankings method', async () => {
  const empty = {
    ...actionsFor(),
    marketplaceSkillSections: vi.fn(async () => [
      { section: 'hot' as const, entries: [] },
      { section: 'new' as const, entries: [] },
      { section: 'rising' as const, entries: [] },
    ]),
  };
  await act(async () => root.render(createElement(MarketSkills, { actions: empty, t })));
  expect(host.querySelector('[data-market-skill-ranking]')).toBeNull();
  expect(host.textContent).not.toContain(t('market.skills.all'));
  await act(async () => root.render(createElement(MarketSkills, { actions: actionsFor(), t })));
  expect(host.querySelector('[data-market-skill="tidy-notes"]')).not.toBeNull();
  expect(host.querySelector('[data-market-skill-ranking]')).toBeNull();
});

it('reads the Host Skill rankings and treats a Host without them as empty', async () => {
  const invoke = vi
    .fn()
    .mockResolvedValueOnce({
      sections: [
        { section: 'rising', entries: [{ skill, score: 3 }, { skill: { id: 'broken' } }] },
      ],
    })
    .mockRejectedValueOnce(new BridgeCallError('unknown-method', 'no such method'));
  const actions = createMarketplaceSkillActions(invoke, async () => undefined);
  expect(await actions.marketplaceSkillSections()).toEqual([
    { section: 'hot', entries: [] },
    { section: 'new', entries: [] },
    { section: 'rising', entries: [{ skill, score: 3 }] },
  ]);
  expect(await actions.marketplaceSkillSections()).toEqual([]);
  expect(invoke).toHaveBeenCalledWith('marketplaceSkillSections', {});
});

it('refreshes the install count on ranking cards after adding', async () => {
  const actions = {
    ...actionsFor(),
    marketplaceSkillSections: vi.fn(async () => [
      { section: 'hot' as const, entries: [{ skill, score: 5 }] },
    ]),
  };
  await act(async () => root.render(createElement(MarketSkills, { actions, t })));
  const ranked = () =>
    host.querySelector('[data-market-skill-ranking="hot"] [data-market-skill="tidy-notes"]');
  await act(async () => ranked()!.querySelector<HTMLButtonElement>('button')!.click());
  await act(async () => buttonNamed(t('market.skills.addOpen')).click());
  await act(async () => checkbox(t('market.skills.global')).click());
  actions.marketplaceSkillDetail.mockResolvedValue({
    skill: { ...skill, installs: 3 },
    content: '',
    files: review.files,
  });
  await act(async () => buttonNamed(t('market.skills.add')).click());
  expect(ranked()?.textContent).toContain(t('market.skills.installs', { count: 3 }));
});
