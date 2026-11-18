import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';

const alice = humanContext('alice');
const bob = humanContext('bob');
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0).reverse()) {
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

function fixture() {
  const home = createTempRoot('team-bot-memory-');
  const core = createCore({ dshHome: home });
  cores.push(core);
  const db = attachOperationalModule(core.operationalDatabase, 'memory-test');
  db.transaction((db) => {
    for (const human of [alice, bob]) {
      db.prepare("INSERT INTO humans VALUES (?, ?, 'active', 'before')").run(
        human.humanId,
        human.humanId,
      );
      db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(human.humanId);
    }
    db.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  for (const human of [owner, alice, bob]) {
    core.spaces.ensureAccount(human.humanId);
    const slug = human.humanId + '-bot';
    expect(core.registry.create({ slug, displayName: slug, ownerHumanId: human.humanId }).ok).toBe(
      true,
    );
    core.channels.getOrCreateDm(human, slug, slug);
  }
  const bridge = createBridgeMethodsForHumans(core);
  return { core, home, db, bridge, member: bridge(alice), channelId: 'dm-alice-bot' };
}

function put(root: string, name: string) {
  const path = join(root, '.agents/skills', name, 'SKILL.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\nname: ${name}\ndescription: Skill ${name}\n---\nDo ${name}\n`);
  return path;
}

describe('members manage the Skills of their own Bots', () => {
  it("lists, shows and removes Skills on their Bot but not on anyone else's", async () => {
    const f = fixture();
    const mine = f.core.registry.memoryDirFor('alice-bot')!;
    const theirs = f.core.registry.memoryDirFor('bob-bot')!;
    const path = put(mine, 'review');
    put(theirs, 'secret');
    expect(await f.member.botSkills({ slug: 'alice-bot' })).toMatchObject({
      ok: true,
      value: { skills: [{ name: 'review' }] },
    });
    expect(await f.member.skillShow({ name: 'review', owner: 'bot:alice-bot' })).toMatchObject({
      ok: true,
      value: { skill: { name: 'review', content: expect.stringContaining('Do review') } },
    });
    for (const call of [
      () => f.member.botSkills({ slug: 'bob-bot' }),
      () => f.member.botSkillRemove({ slug: 'bob-bot', name: 'secret' }),
      () => f.member.botSkills({ slug: 'owner-bot' }),
    ])
      expect(await call()).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
    for (const key of ['bot:bob-bot', 'host', 'bot:owner-bot'])
      expect(await f.member.skillShow({ name: 'secret', owner: key })).toMatchObject({
        ok: false,
        error: { code: 'skill-not-found' },
      });
    expect(await f.member.botSkillRemove({ slug: 'alice-bot', name: 'review' })).toMatchObject({
      ok: true,
    });
    expect(existsSync(path)).toBe(false);
    expect(existsSync(join(theirs, '.agents/skills/secret/SKILL.md'))).toBe(true);
    void bob;
  });
});
