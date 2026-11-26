import { describe, expect, it } from 'vitest';

import { TOB_BOT_CREATE_CAPABILITIES } from '../src/tob/cli-bot-create.js';
import { classifyTobHostCli } from '../src/tob/cli-host-commands.js';
import { host, invoke, ok } from './cli-host-admin-fixture.js';

const creation = TOB_BOT_CREATE_CAPABILITIES.find(
  (entry) => entry.command === 'create',
)?.description;
const listing = {
  id: 'owner/translator',
  displayName: 'Translator',
  source: 'github',
  installs: 3,
};

describe('Tob offers a custom Bot and live Marketplace candidates', () => {
  it('documents the proposal and review flow in the create capability', () => {
    expect(creation).toContain('Unless the Human skips Marketplace');
    expect(creation).toContain('marketplace-list --include-uploads --query');
    expect(creation).toContain('wait for their choice');
    expect(creation).toContain('show its review before installing');
    expect(creation).toContain('A failed search is unavailable');
    expect(creation).toContain('search: no-matches is an empty result');
    expect(creation).toContain('Use the same key and payload to recover the result');
  });

  it('lets Tob search the catalogue at once but keeps every install and creation behind a card', () => {
    expect(
      classifyTobHostCli(['marketplace-list', '--query', 'translate', '--include-uploads']),
    ).toEqual({ command: 'marketplace-list', write: false });
    for (const argv of [
      ['marketplace-install', 'owner/translator'],
      ['marketplace-install', 'owner/translator', '--review', 'r1', '--confirm'],
      ['create', '--name', 'Translator', '--operation-key', 'k1'],
      ['bot-zip-import', '--operation-key', 'k1', '--name', 'Imported'],
    ])
      expect(classifyTobHostCli(argv).write).toBe(true);
  });
});

describe('marketplace-list search result', () => {
  it('reports matches and no-matches as a stable field on a successful search', async () => {
    const live = await host((_method, args) =>
      ok(
        (args['query'] as { q?: string }).q === 'nothing'
          ? { bots: [] }
          : { bots: [listing], nextCursor: 'c2' },
      ),
    );
    const found = await invoke(['marketplace-list', '--query', 'translate'], live.url);
    expect(found.code).toBe(0);
    expect(found.json).toEqual({
      bots: [listing],
      nextCursor: 'c2',
      search: 'matches',
    });
    const empty = await invoke(['marketplace-list', '--query', 'nothing'], live.url);
    expect(empty.code).toBe(0);
    expect(empty.json).toEqual({ bots: [], search: 'no-matches' });
  });

  it('fails with marketplace-unavailable instead of an empty result when the Marketplace cannot answer', async () => {
    const live = await host(() => ({
      ok: false,
      error: {
        code: 'marketplace-unavailable',
        message: 'Bot Marketplace is unavailable',
      },
    }));
    const refused = await invoke(['marketplace-list', '--query', 'translate'], live.url);
    expect(refused.code).not.toBe(0);
    expect(refused.json.error.code).toBe('marketplace-unavailable');
    expect(refused.json).not.toHaveProperty('search');
    expect(refused.json).not.toHaveProperty('bots');
  });
});
