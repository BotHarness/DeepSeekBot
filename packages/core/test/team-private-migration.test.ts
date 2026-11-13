import { describe, expect, it } from 'vitest';
import { mountOperationalDatabase, attachOperationalModule } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

describe('M2 ownership persistence and query budget', () => {
  it('migrates existing Bots and Tob to local-human without changing their identities', () => {
    const home = createTempRoot('team-m2-migration-');
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 141),
      ),
    });
    attachOperationalModule(prior, 'migration-fixture').transaction((db) => {
      db.prepare('INSERT INTO persona_bots(slug, body) VALUES (?, ?)').run(
        'legacy',
        JSON.stringify({
          slug: 'legacy',
          displayName: 'Legacy',
          createdAt: '2026-11-13T00:00:00Z',
          workspaces: [],
        }),
      );
      db.prepare("INSERT INTO tob_identity(singleton, bot_slug) VALUES (1, 'legacy')").run();
    });
    prior.close();
    const upgraded = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const port = attachOperationalModule(upgraded, 'migration-check');
    expect(
      port.read((db) =>
        db
          .prepare(
            "SELECT slug, owner_human_id, json_extract(body, '$.ownerHumanId') AS body_owner FROM persona_bots",
          )
          .get(),
      ),
    ).toEqual({ slug: 'legacy', owner_human_id: 'local-human', body_owner: 'local-human' });
    expect(port.read((db) => db.prepare('SELECT * FROM tob_identity').get())).toEqual({
      human_id: 'local-human',
      bot_slug: 'legacy',
    });
  });

  it('uses the ownership index and never decodes unrelated Bot records as the Host grows', () => {
    const home = createTempRoot('team-m2-query-budget-');
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const registry = createTestRegistry({ database: owner, rootDir: home + '/bots' });
    registry.create({ slug: 'own-bot', displayName: 'Own', ownerHumanId: 'bob' });
    const port = attachOperationalModule(owner, 'budget-fixture');
    port.transaction((db) => {
      const insert = db.prepare(
        'INSERT INTO persona_bots(slug, body, owner_human_id) VALUES (?, ?, ?)',
      );
      for (let index = 0; index < 2000; index++)
        insert.run('unrelated-' + index, '{"private":"must never decode"}', 'alice');
    });
    const before = owner.diagnostics().metrics.reads;
    expect(registry.list('bob').map((bot) => bot.slug)).toEqual(['own-bot']);
    expect(owner.diagnostics().metrics.reads - before).toBe(2);
    expect(registry.listHistorical('bob').map((bot) => bot.slug)).toEqual(['own-bot']);
    const plan = port.read((db) =>
      db
        .prepare('EXPLAIN QUERY PLAN SELECT slug, body FROM persona_bots WHERE owner_human_id = ?')
        .all('bob'),
    );
    expect(JSON.stringify(plan)).toContain('persona_bots_owner');
  });
});
