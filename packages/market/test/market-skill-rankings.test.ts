import { expect, it } from 'vitest';
import {
  MARKETPLACE_SKILL_SECTIONS,
  parseMarketplaceSkillSectionView,
  type MarketplaceSkillSectionName,
} from '../../host-protocol/src/marketplace-skill.js';
import { RANKING_WINDOW_MS } from '../src/rankings.js';
import { createMarket } from './market-harness.js';

type Market = ReturnType<typeof createMarket>;

async function section(market: Market, name: MarketplaceSkillSectionName) {
  const response = await market.request(`/v1/skills/sections/${name}`);
  expect(response.status).toBe(200);
  const view = parseMarketplaceSkillSectionView(await response.json());
  if (view === undefined) throw new Error('Invalid Skill ranking response');
  return view;
}

function listSkill(market: Market, name: string, firstSeen: number) {
  const id = name.charCodeAt(0).toString(16).padStart(24, '0');
  const firstSeenAt = new Date(firstSeen).toISOString();
  market.sqlite
    .prepare(
      `INSERT INTO marketplace_skills
        (id, repo_node_id, owner, repo, path, name, description, skill_md, scan, commit_sha,
         pushed_at, visibility, first_seen_at, last_refreshed_at)
       VALUES (?, ?, 'Owner', 'Repo', '', ?, '', '', 'clean', ?, ?, 'listed', ?, ?)`,
    )
    .run(id, id, name, 'a'.repeat(40), market.clock.value.toISOString(), firstSeenAt, firstSeenAt);
  return id;
}

it('returns empty sections before the first snapshot and records an empty daily run', async () => {
  const market = createMarket();
  for (const name of MARKETPLACE_SKILL_SECTIONS) {
    expect(await section(market, name)).toEqual({ section: name, day: null, entries: [] });
  }
  expect((await market.request('/v1/skills/sections/popular')).status).toBe(404);
  await market.daily();
  for (const name of MARKETPLACE_SKILL_SECTIONS) {
    expect(await section(market, name)).toEqual({
      section: name,
      day: '2026-10-05',
      entries: [],
    });
  }
});

it('ranks Hot and Rising by their receipt windows and New by first sighting', async () => {
  const market = createMarket();
  const now = market.clock.value.getTime();
  const recent = now - RANKING_WINDOW_MS;
  const previous = recent - RANKING_WINDOW_MS;
  const steady = listSkill(market, 'Steady', previous - 1);
  const rising = listSkill(market, 'Rising', previous);
  const low = listSkill(market, 'Low', recent);
  const newest = listSkill(market, 'Newest', now - 1);
  const hidden = listSkill(market, 'Hidden', now);
  const insert = market.sqlite.prepare(
    'INSERT OR IGNORE INTO skill_install_receipts (skill_id, target_hash, created_at) VALUES (?, ?, ?)',
  );
  const receipts = (id: string, times: number[]) =>
    times.forEach((time, index) => insert.run(id, String(index).padStart(64, '0'), time));

  receipts(steady, [previous, recent - 1, recent - 2, recent, recent + 1, now]);
  receipts(rising, [previous - 1, previous, recent, recent + 1, now, now + 1]);
  receipts(low, [recent, recent + 1]);
  receipts(hidden, [recent, recent + 1, now]);
  insert.run(rising, '2'.padStart(64, '0'), now);
  const hide = market.sqlite.prepare(
    "UPDATE marketplace_skills SET visibility = 'blocked' WHERE id = ?",
  );
  hide.run(hidden);

  await market.daily();
  const ranked = async (name: MarketplaceSkillSectionName) =>
    (await section(market, name)).entries.map(({ skill, score }) => [skill.id, score]);

  expect(await ranked('hot')).toEqual([
    [rising, 3],
    [steady, 3],
    [low, 2],
  ]);
  expect(await ranked('new')).toEqual([
    [newest, 0],
    [low, 0],
    [rising, 0],
    [steady, 0],
  ]);
  expect(await ranked('rising')).toEqual([[rising, 2]]);
  expect(
    market.sqlite
      .prepare('SELECT COUNT(*) AS count FROM skill_ranking_snapshots WHERE skill_id = ?')
      .get(hidden),
  ).toMatchObject({ count: 0 });

  hide.run(rising);
  expect(await ranked('hot')).toEqual([
    [steady, 3],
    [low, 2],
  ]);
  expect(await ranked('rising')).toEqual([]);
  await market.daily();
  expect(await ranked('new')).toEqual([
    [newest, 0],
    [low, 0],
    [steady, 0],
  ]);

  market.clock.value = new Date(now + 2 * RANKING_WINDOW_MS);
  await market.daily();
  expect(await section(market, 'hot')).toMatchObject({ day: '2026-10-19', entries: [] });
});

it('parses only recognized sections with a snapshot day and valid scored Skills', async () => {
  const market = createMarket();
  listSkill(market, 'Newest', market.clock.value.getTime());
  await market.daily();
  const view = await section(market, 'new');
  expect(parseMarketplaceSkillSectionView(view)).toEqual(view);
  expect(parseMarketplaceSkillSectionView({ ...view, section: 'popular' })).toBeUndefined();
  expect(parseMarketplaceSkillSectionView({ ...view, day: undefined })).toBeUndefined();
  expect(
    parseMarketplaceSkillSectionView({ ...view, entries: [{ skill: {}, score: 0 }] }),
  ).toBeUndefined();
  expect(
    parseMarketplaceSkillSectionView({
      ...view,
      entries: view.entries.map((entry) => ({ ...entry, score: Infinity })),
    }),
  ).toBeUndefined();
});
