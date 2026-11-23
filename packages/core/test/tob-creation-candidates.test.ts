import { describe, expect, it } from 'vitest';

import { DEFAULT_PROMPT_TEXT } from '../src/prompts/prompt-parts.js';
import { orchestratorPromptSections } from '../src/runtime/dsh-bot-agent-adapter.js';
import { classifyTobHostCli } from '../src/tob/cli-host-commands.js';
import { host, invoke, ok } from './cli-host-admin-fixture.js';

const tobRole = orchestratorPromptSections(DEFAULT_PROMPT_TEXT, true).role;
const botRole = orchestratorPromptSections(DEFAULT_PROMPT_TEXT, false).role;
const creation = tobRole
  .slice(tobRole.indexOf('When the Human asks you to create a Bot'))
  .split('\n')[0]!;
const listing = {
  id: 'owner/translator',
  displayName: 'Translator',
  source: 'github',
  installs: 3,
};

describe('Tob offers a custom Bot and live Marketplace candidates', () => {
  it('searches the Marketplace before proposing unless the Human skips it', () => {
    expect(creation).toContain('Unless the Human explicitly says to skip the Marketplace');
    expect(creation).toContain('deepseekbot marketplace-list --include-uploads --query');
    expect(creation).toContain('offers both a custom Bot and live Marketplace candidates');
    expect(creation).toContain('short Soul and Core Memory draft');
    expect(creation).toContain('create or install nothing until they do');
    expect(botRole).not.toContain('marketplace-list');
  });

  it('tells an unavailable search apart from no matches', () => {
    expect(creation).toContain(
      'search no-matches means the Marketplace answered and no listing matched',
    );
    expect(creation).toContain('a failed marketplace-list, such as marketplace-unavailable');
    expect(creation).toContain('never call it no matches');
  });

  it('routes each choice to the existing creation or import owner and its receipt', () => {
    expect(creation).toContain(
      'run create with the reviewed name, Bio, tags, --persona and --core-memory',
    );
    expect(creation).toContain('install with --review and --confirm only after the Human agrees');
    expect(creation).toContain('bot-import-preview then create --from-git');
    expect(creation).toContain('bot-zip-preview then bot-zip-import');
    expect(creation).toContain('never substitute a review of your own');
    expect(creation).toContain('create-status, bot-zip-import-status');
    expect(creation).toContain('Never use bot_create for Tob');
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
