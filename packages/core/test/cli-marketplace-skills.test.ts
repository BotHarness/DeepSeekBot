import { expect, it } from 'vitest';
import { cliEffects } from '../src/kernel/cli-effects.js';
import { host, invoke, ok } from './cli-host-admin-fixture.js';

it('dispatches the skills subcommands through the Host and requires confirmation for replacement and deletion', async () => {
  const live = await host((method) => ok({ method }));
  const id = '1'.repeat(24);
  const publish = ['skills', 'publish', 'tidy-notes', '--bot', 'author'];
  const replace = ['skills', 'replace', id, 'tidy-notes', '--bot', 'author'];
  const remove = ['skills', 'delete', id];
  for (const command of [publish, replace, remove]) {
    expect(cliEffects(command)).toMatchObject({ changes: 'irreversible', reach: 'external' });
  }
  expect(cliEffects(['skills', 'mine'])).toMatchObject({ changes: 'none', reach: 'external' });
  expect((await invoke(publish, live.url)).code).toBe(0);
  expect((await invoke(replace, live.url)).json.error.code).toBe('usage');
  expect((await invoke(remove, live.url)).json.error.code).toBe('usage');
  expect((await invoke([...replace, '--confirm'], live.url)).code).toBe(0);
  expect((await invoke([...remove, '--confirm'], live.url)).code).toBe(0);
  expect((await invoke(['skills', 'mine'], live.url)).code).toBe(0);
  expect(live.calls).toEqual([
    { method: 'marketplaceSkillPublish', args: { bot: 'author', name: 'tidy-notes' } },
    { method: 'marketplaceSkillReplace', args: { id, bot: 'author', name: 'tidy-notes' } },
    { method: 'marketplaceSkillDelete', args: { id } },
    { method: 'marketplaceSkillMine', args: {} },
  ]);
});

it('surfaces the Host scan refusal from skills publish', async () => {
  const live = await host(() => ({
    ok: false,
    error: { code: 'skill-secret-detected', message: 'A file contains a possible credential.' },
  }));
  const result = await invoke(['skills', 'publish', 'tidy-notes', '--bot', 'author'], live.url);
  expect(result.code).not.toBe(0);
  expect(result.json.error).toMatchObject({
    code: 'skill-secret-detected',
    message: 'A file contains a possible credential.',
  });
});

it('reads all Marketplace Skill rankings and can filter to one section', async () => {
  const sections = ['hot', 'new', 'rising'].map((section) => ({ section, entries: [] }));
  const live = await host(() => ok(sections));
  const command = ['market', 'skills', 'sections'];
  expect(cliEffects(command)).toMatchObject({ changes: 'none', reach: 'external' });
  expect(await invoke(command, live.url)).toMatchObject({ code: 0, json: sections });
  expect(await invoke([...command, '--section', 'rising'], live.url)).toMatchObject({
    code: 0,
    json: [sections[2]],
  });
  expect((await invoke([...command, '--section', 'popular'], live.url)).json.error.code).toBe(
    'usage',
  );
  expect(live.calls).toEqual([
    { method: 'marketplaceSkillSections', args: {} },
    { method: 'marketplaceSkillSections', args: {} },
  ]);
});
