import { describe, expect, it } from 'vitest';
import type { SessionModelCatalog } from '../src/host/session-model-query';
import {
  SKELETON_API_ROWS,
  SKELETON_SUB_ROWS,
  catalogDefaultChoice,
  filterSessionModelSections,
  sessionModelFilters,
  sessionModelSections,
  sessionModelSkeleton,
} from '../src/ui/chat/session-model-sections';

const strings = {
  defaultName: 'Use the Default preset',
  subscriptions: 'Subscriptions',
  apiModels: 'API models',
  groups: 'Routing Groups',
  api: 'API',
  sub: 'Sub',
  other: 'Other',
};

const catalog = {
  models: [
    {
      provider: 'opencode-go',
      providerName: 'OpenCode Go',
      model: 'deepseek-v4.1-flash',
      modelName: 'DeepSeek V4.1 Flash',
    },
    {
      provider: 'opencode-go',
      providerName: 'OpenCode Go',
      model: 'claude-haiku-5-5',
      modelName: 'Claude Haiku 5.5',
    },
    {
      provider: 'opencode-go',
      providerName: 'OpenCode Go',
      model: 'mystery-7',
      modelName: 'Mystery 7',
    },
    { provider: 'acme', providerName: 'Acme', model: 'zeta-1', modelName: 'Zeta 1' },
  ],
  default: { provider: 'opencode-go', model: 'claude-haiku-5-5' },
  groups: [{ id: 'fast', name: 'Fast group', revision: 1, routes: [] }],
  engines: [
    {
      engine: 'claude',
      available: true,
      accountId: 'work',
      accountName: 'Work',
      models: [{ id: 'claude-opus-5-5', name: 'Claude Opus 5.5', efforts: [] }],
    },
  ],
} as unknown as SessionModelCatalog;

const build = (native = false) =>
  sessionModelSections({
    catalog,
    defaultChoice: catalogDefaultChoice(catalog),
    native,
    strings,
  });

describe('Session model picker sections', () => {
  it('keeps Default, subscriptions, API models and Routing Groups in a fixed order', () => {
    const sections = build();
    expect(sections.map((section) => [section.id, section.title])).toEqual([
      ['default', ''],
      ['subs', 'Subscriptions'],
      ['api', 'API models'],
      ['groups', 'Routing Groups'],
    ]);
    expect(sections[1]!.rows.map((row) => [row.source, row.brand, row.tag])).toEqual([
      ['sub', 'claude', 'Sub'],
    ]);
  });

  it('names the concrete model the Default row resolves to', () => {
    const [defaults] = build(true);
    expect(defaults!.rows[0]).toMatchObject({ name: 'Use the Default preset', choice: null });
    expect(defaults!.rows[0]!.detail).toContain('Haiku 5.5');
    expect(defaults!.rows[0]!.brand).toBe('claude');
  });

  it('resolves the Default row to the Default preset group when one is set', () => {
    const grouped = { ...catalog, defaultGroupId: 'fast' } as SessionModelCatalog;
    expect(catalogDefaultChoice(grouped)).toEqual({ kind: 'group', id: 'fast' });
    expect(catalogDefaultChoice(undefined)).toBeNull();
  });

  it('offers one filter per brand and source, subscriptions first', () => {
    expect(
      sessionModelFilters(build(), 'Other').map((filter) => [
        filter.key,
        filter.source,
        filter.title,
      ]),
    ).toEqual([
      ['sub:claude', 'sub', 'Claude'],
      ['api:opencode', 'api', 'OpenCode'],
      ['api:deepseek', 'api', 'DeepSeek'],
      ['api:claude', 'api', 'Claude'],
      ['api:other', 'api', 'Other'],
    ]);
  });

  it('filters rows to one brand and source while the Default row stays', () => {
    const filtered = filterSessionModelSections(build(), 'api:claude');
    expect(filtered.map((section) => section.id)).toEqual(['default', 'api']);
    expect(filtered[1]!.rows.map((row) => row.name)).toEqual(['Haiku 5.5']);
    expect(filterSessionModelSections(build(), 'sub:claude').map((s) => s.id)).toEqual([
      'default',
      'subs',
    ]);
    expect(filterSessionModelSections(build(), undefined).map((s) => s.id)).toEqual([
      'default',
      'subs',
      'api',
      'groups',
    ]);
  });

  it('draws the skeleton with the same sections and headers as the loaded list', () => {
    expect(sessionModelSkeleton(false, strings)).toEqual([
      { id: 'default', title: '', rows: 1 },
      { id: 'subs', title: 'Subscriptions', rows: SKELETON_SUB_ROWS },
      { id: 'api', title: 'API models', rows: SKELETON_API_ROWS },
    ]);
    expect(sessionModelSkeleton(true, strings).map((section) => section.id)).toEqual([
      'default',
      'api',
    ]);
    expect(
      build(true)
        .filter((s) => s.rows.length > 0)
        .map((s) => s.id),
    ).toEqual(['default', 'api']);
  });
});
