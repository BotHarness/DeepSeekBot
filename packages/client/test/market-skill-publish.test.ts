// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarketplaceSkill } from '@botharness/host-protocol/marketplace-skill';
import { buttonNamed, fieldNamed, menuItem, typeInto } from './primitive-mocks.js';
import type { BridgeActions } from '../src/client/actions.js';
import { BotSkillsCard, type BotSkillsSource } from '../src/client/bot-skills-card.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { MyUploadsSettingsRow } from '../src/client/market-mine.js';
import { MarketSkills } from '../src/client/market-skills.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives, shellPrimitives } = await import('./primitive-mocks.js');
  return { ...shellPrimitives(), ...dialogPrimitives() };
});

const author = { name: 'Alice', id: 'k3x9q2', termsAcceptedAt: '2026-10-27T00:00:00Z' };

const uploaded: MarketplaceSkill = {
  upload: { author: { name: 'Alice', id: 'k3x9q2' }, revision: 'd'.repeat(32) },
  id: 'a'.repeat(24),
  name: 'tidy',
  description: 'Keep notes tidy.',
  owner: '',
  repo: '',
  fullName: '',
  path: '',
  htmlUrl: '',
  commitSha: '',
  stars: 0,
  installs: 4,
  scripts: ['scripts/fmt.py'],
  scan: 'warning',
  findings: [{ kind: 'prompt-injection', path: 'SKILL.md', line: 3, severity: 'warning' }],
  fileCount: 2,
  size: 120,
  official: false,
  pushedAt: '2026-11-01T00:00:00Z',
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

async function render(element: ReactElement): Promise<void> {
  await act(async () => root.render(element));
}

async function press(element: Element | null | undefined): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error('missing element');
  await act(async () => element.click());
}

function submitButton(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (found === null) throw new Error('missing submit');
  return found;
}

function skillsSource(publish: Pick<BridgeActions, 'marketplaceSkillPublish'> & object) {
  const actions = {
    marketplaceAccount: vi.fn(async () => ({ signedIn: true, author })),
    marketplaceAuthorSave: vi.fn(async () => author),
    marketplaceSkillMine: vi.fn(async (): Promise<{ skills: MarketplaceSkill[] }> => ({
      skills: [],
    })),
    marketplaceSkillAddCandidates: vi.fn(async () => ({
      bots: [
        { slug: 'bob', displayName: 'Bob' },
        { slug: 'ada', displayName: 'Ada' },
      ],
      global: false,
    })),
    botSkills: vi.fn(async () => [{ name: 'tidy', description: 'Tidy' }]),
    marketplaceSkillDetail: vi.fn(async () => ({
      skill: uploaded,
      content: '---\nname: tidy\n---\nBody',
      files: [],
    })),
    ...publish,
  };
  const source: BotSkillsSource = {
    list: vi.fn(async () => [
      {
        name: 'tidy',
        description: 'Keep notes tidy.',
        path: '.agents/skills/tidy/SKILL.md',
        userInvocable: true,
      },
    ]),
    read: vi.fn(async (name: string) => ({
      name,
      description: 'Keep notes tidy.',
      owner: { kind: 'bot' as const, botSlug: 'ada' },
      path: `.agents/skills/${name}/SKILL.md`,
      content: 'Body',
    })),
    remove: vi.fn(async () => undefined),
    publish: { bot: 'ada', actions: actions as unknown as BridgeActions },
  };
  return { source, actions };
}

async function openPublish(source: BotSkillsSource): Promise<void> {
  await render(createElement(BotSkillsCard, { source, botName: 'Ada', t }));
  await press(host.querySelector('[data-skill-row="tidy"]'));
  await press(host.querySelector('[data-skill-publish="tidy"]'));
}

describe('Publishing a Bot Skill', () => {
  it('offers no Marketplace entry without the Host owner publish source', async () => {
    const { source } = skillsSource({ marketplaceSkillPublish: vi.fn() });
    const rest: BotSkillsSource = { list: source.list, read: source.read, remove: source.remove };
    await render(createElement(BotSkillsCard, { source: rest, botName: 'Ada', t }));
    await press(host.querySelector('[data-skill-row="tidy"]'));
    expect(host.querySelector('[data-skill-publish]')).toBeNull();
  });

  it('publishes under the Author ID and shows the scan warnings and script flag', async () => {
    const publish = vi.fn(async () => uploaded);
    const { source } = skillsSource({ marketplaceSkillPublish: publish });
    await openPublish(source);
    const dialog = document.querySelector('[data-market-skill-publish="details"]');
    expect(dialog?.textContent).toContain(
      t('market.skills.author', { name: 'Alice', id: 'k3x9q2' }),
    );
    expect(dialog?.textContent).toContain(t('market.skills.publishScan'));
    await press(submitButton());
    expect(publish).toHaveBeenCalledWith({
      bot: 'ada',
      name: 'tidy',
      expectedAuthorId: 'k3x9q2',
      requestKey: expect.stringMatching(/^[0-9a-f]{32}$/u),
    });
    const result = document.querySelector('[data-market-skill-publish="done"]');
    expect(result?.textContent).toContain(t('market.skills.published'));
    const scan = result?.querySelector('[data-market-skill-scan="warning"]');
    expect(scan?.textContent).toContain('Alice #k3x9q2');
    expect(scan?.textContent).toContain(t('market.skills.hasScripts'));
    expect(scan?.textContent).toContain(t('market.skills.finding.prompt-injection'));
    expect(scan?.querySelector('[data-market-skill-scripts]')?.textContent).toBe('scripts/fmt.py');
    await press(submitButton());
    expect(document.querySelector('[data-market-skill-publish]')).toBeNull();
  });

  it('tells the author why an upload with a secret was refused and keeps the request key', async () => {
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new BridgeCallError('skill-secret-detected', 'refused'))
      .mockResolvedValueOnce({ ...uploaded, scan: 'clean', findings: [], scripts: [] });
    const { source } = skillsSource({ marketplaceSkillPublish: publish });
    await openPublish(source);
    await press(submitButton());
    const rejection = document.querySelector('[data-market-skill-rejected]');
    expect(rejection?.getAttribute('role')).toBe('alert');
    expect(rejection?.textContent).toContain(t('market.skills.rejectedTitle'));
    expect(rejection?.textContent).toContain(t('market.error.skillSecret'));
    await press(submitButton());
    const keys = publish.mock.calls.map(([input]) => (input as { requestKey: string }).requestKey);
    expect(keys[0]).toBe(keys[1]);
    expect(document.querySelector('[data-market-skill-scan="clean"]')?.textContent).toContain(
      t('market.skills.cleanScan'),
    );
  });

  it('sets up the Author ID before the upload step', async () => {
    const publish = vi.fn(async () => uploaded);
    const { source, actions } = skillsSource({ marketplaceSkillPublish: publish });
    actions.marketplaceAccount.mockResolvedValue({
      signedIn: true,
      author: null,
    } as unknown as Awaited<ReturnType<typeof actions.marketplaceAccount>>);
    await openPublish(source);
    expect(document.querySelector('[data-market-skill-publish="account"]')).not.toBeNull();
    expect(submitButton().disabled).toBe(true);
    await typeInto(fieldNamed(t('market.author.name')), 'Alice');
    await press(document.querySelector('input[type="checkbox"]'));
    await press(submitButton());
    expect(actions.marketplaceAuthorSave).toHaveBeenCalledWith('Alice', true);
    expect(document.querySelector('[data-market-skill-publish="details"]')).not.toBeNull();
    expect(publish).not.toHaveBeenCalled();
  });
});

describe('A Bot Skill that is already listed (#5580)', () => {
  async function openSkill(source: BotSkillsSource): Promise<void> {
    await render(createElement(BotSkillsCard, { source, botName: 'Ada', t }));
    await press(host.querySelector('[data-skill-row="tidy"]'));
  }

  it('shows the listing and offers Replace and View listing instead of Publish', async () => {
    const { source, actions } = skillsSource({ marketplaceSkillPublish: vi.fn() });
    actions.marketplaceSkillMine.mockResolvedValue({ skills: [uploaded] });
    await openSkill(source);
    expect(host.querySelector(`[data-skill-listed="${uploaded.id}"]`)?.textContent).toBe(
      t('market.skills.listed'),
    );
    expect(host.querySelector('[data-skill-publish]')).toBeNull();
    await press(host.querySelector('[data-skill-replace="tidy"]'));
    expect(actions.botSkills).toHaveBeenCalledWith('ada');
    expect(document.querySelector(`[data-market-skill-replace="${uploaded.id}"]`)).not.toBeNull();
    await press(buttonNamed(t('common.cancel')));
    await press(host.querySelector('[data-skill-view-listing="tidy"]'));
    expect(actions.marketplaceSkillDetail).toHaveBeenCalledWith(uploaded.id);
  });

  it('offers Publish when the listing check fails', async () => {
    const { source, actions } = skillsSource({ marketplaceSkillPublish: vi.fn() });
    actions.marketplaceSkillMine.mockRejectedValue(new BridgeCallError('sign-in-required', 'x'));
    await openSkill(source);
    expect(host.querySelector('[data-skill-publish="tidy"]')).not.toBeNull();
    expect(host.querySelector('[data-skill-listed]')).toBeNull();
  });

  it('explains a taken name and shows the listing once the dialog closes', async () => {
    const publish = vi.fn().mockRejectedValue(new BridgeCallError('skill-name-taken', 'taken'));
    const { source, actions } = skillsSource({ marketplaceSkillPublish: publish });
    await openSkill(source);
    await press(host.querySelector('[data-skill-publish="tidy"]'));
    await press(submitButton());
    expect(document.querySelector('[data-market-skill-rejected]')?.textContent).toContain(
      t('market.error.skillNameTaken'),
    );
    actions.marketplaceSkillMine.mockResolvedValue({ skills: [uploaded] });
    await press(buttonNamed(t('common.close')));
    expect(actions.marketplaceSkillMine).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-skill-replace="tidy"]')).not.toBeNull();
  });
});
describe('Uploaded Skills in the Marketplace', () => {
  it('shows the author display name and Author ID and offers a report', async () => {
    const actions = {
      marketplaceSkillList: vi.fn(async () => ({ skills: [uploaded], nextCursor: null })),
      marketplaceSkillDetail: vi.fn(async () => ({
        skill: uploaded,
        content: '# Tidy',
        files: [{ path: 'SKILL.md', size: 100 }],
      })),
      marketplaceSkillAddCandidates: vi.fn(),
      marketplaceSkillReview: vi.fn(),
      marketplaceSkillAdd: vi.fn(),
      marketplaceSkillReport: vi.fn(async () => undefined),
      marketplaceChallenge: vi.fn(),
    };
    await render(createElement(MarketSkills, { actions, t }));
    const card = host.querySelector('[data-market-skill="tidy"]');
    expect(card?.textContent).toContain('Alice #k3x9q2');
    await press(card?.querySelector('button') ?? card);
    const detail = document.querySelector('[data-market-skill-detail="tidy"]');
    expect(detail?.textContent).toContain('Alice #k3x9q2');
    expect(detail?.querySelector('a')).toBeNull();
    await press(buttonNamed(t('market.report.open')));
    expect(document.querySelector('[data-market-report="open"]')?.textContent).toContain(
      t('market.skills.report.title'),
    );
  });
});

describe('My uploads', () => {
  function uploadActions(mine: () => Promise<{ skills: MarketplaceSkill[] }>) {
    return {
      marketplaceMine: vi.fn(async () => []),
      marketplaceSkillMine: vi.fn(mine),
      marketplaceSkillAddCandidates: vi.fn(async () => ({
        bots: [
          { slug: 'ada', displayName: 'Ada' },
          { slug: 'bob', displayName: 'Bob' },
        ],
        global: false,
      })),
      botSkills: vi.fn(async (slug: string) =>
        slug === 'ada'
          ? [
              { name: 'notes', description: 'Notes' },
              { name: 'tidy', description: 'Tidy' },
            ]
          : [{ name: 'fresh', description: 'Fresh' }],
      ),
      marketplaceSkillReplace: vi.fn(async () => ({
        ...uploaded,
        scan: 'clean' as const,
        findings: [],
      })),
      marketplaceSkillDelete: vi.fn(async () => ({ deleted: true as const })),
    };
  }

  async function openUploads(actions: ReturnType<typeof uploadActions>): Promise<void> {
    await render(
      createElement(MyUploadsSettingsRow, { actions: actions as unknown as BridgeActions, t }),
    );
    expect(host.textContent).toContain(t('market.mine.title'));
    await press(buttonNamed(t('market.mine.manage')));
  }

  it('replaces a published Skill from a chosen Bot after stating that added copies stay', async () => {
    const actions = uploadActions(async () => ({ skills: [uploaded] }));
    await openUploads(actions);
    const row = document.querySelector('[data-market-mine-skill]');
    expect(row?.textContent).toContain('tidy');
    expect(row?.textContent).toContain(t('market.skills.warning'));
    await press(buttonNamed(t('market.skills.mine.replaceLabel', { name: 'tidy' })));
    expect(actions.botSkills).toHaveBeenCalledWith('ada');
    const replace = document.querySelector(`[data-market-skill-replace="${uploaded.id}"]`);
    expect(replace?.textContent).toContain(
      t('market.skills.mine.replaceConfirm', { name: 'tidy' }),
    );
    await press(buttonNamed(t('market.skills.mine.bot')));
    await press(menuItem('Bob'));
    expect(actions.botSkills).toHaveBeenCalledWith('bob');
    await press(submitButton());
    expect(actions.marketplaceSkillReplace).toHaveBeenCalledWith({
      id: uploaded.id,
      bot: 'bob',
      name: 'fresh',
      expectedAuthorId: 'k3x9q2',
    });
    expect(document.body.textContent).toContain(t('market.skills.replaced'));
    await press(submitButton());
    expect(document.querySelector('[data-market-mine="list"]')).not.toBeNull();
    expect(document.querySelector('[data-market-mine-skill]')?.textContent).not.toContain(
      t('market.skills.warning'),
    );
  });

  it('deletes a published Skill after a confirm that names unaffected copies', async () => {
    const actions = uploadActions(async () => ({ skills: [uploaded] }));
    await openUploads(actions);
    await press(buttonNamed(t('market.mine.deleteLabel', { name: 'tidy' })));
    expect(document.body.textContent).toContain(t('market.skills.mine.deleteBody'));
    await act(async () => document.querySelector('form')!.requestSubmit());
    expect(actions.marketplaceSkillDelete).toHaveBeenCalledWith(uploaded.id);
    expect(document.querySelector('[data-market-mine-skill]')).toBeNull();
    expect(document.body.textContent).toContain(t('market.skills.mine.empty'));
  });

  it('retries only the Skill list after a failed read', async () => {
    let fail = true;
    const actions = uploadActions(async () => {
      if (fail) throw new BridgeCallError('marketplace-unavailable', 'down');
      return { skills: [uploaded] };
    });
    await openUploads(actions);
    expect(document.querySelector('[data-market-mine-skill]')).toBeNull();
    fail = false;
    await press(buttonNamed(t('market.retry')));
    expect(actions.marketplaceSkillMine).toHaveBeenCalledTimes(2);
    expect(actions.marketplaceMine).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-market-mine-skill]')?.textContent).toContain('tidy');
  });

  it('leaves Skills out for a viewer who is not the Host owner', async () => {
    const actions = uploadActions(async () => {
      throw new BridgeCallError('permission-required', 'owner only');
    });
    await openUploads(actions);
    expect(document.querySelector('[data-market-mine="list"]')?.textContent).not.toContain(
      t('market.mine.skills'),
    );
  });
});
