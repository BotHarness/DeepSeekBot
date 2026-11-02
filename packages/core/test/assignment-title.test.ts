import { describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { deriveAssignmentTitle } from '../src/runtime/assignment-title.js';
import { createTempRoot } from './helpers.js';

const AT = '2026-10-26T00:00:00.000Z';

describe('deriveAssignmentTitle', () => {
  it('keeps a short first line and cuts long text at a sentence or word boundary', () => {
    expect(deriveAssignmentTitle('Fix the Safari export button')).toBe(
      'Fix the Safari export button',
    );
    expect(deriveAssignmentTitle('\n  Check   release\nthen tag it')).toBe('Check release');
    expect(
      deriveAssignmentTitle(
        'Audit the billing exports. Then compare them with the ledger and report gaps.',
      ),
    ).toBe('Audit the billing exports');
    expect(
      deriveAssignmentTitle(
        'Investigate why the nightly search index rebuild takes three hours on staging',
      ),
    ).toBe('Investigate why the nightly search index…');
    const cjk = deriveAssignmentTitle(
      '调研移动端个人资料页的原生标签栏实现方式，并比较 iOS 和 Android 两个平台的系统控件差异与无障碍支持',
    );
    expect([...cjk].length).toBeLessThanOrEqual(41);
    expect(cjk.endsWith('…')).toBe(true);
    expect(deriveAssignmentTitle('   ')).toBe('Assignment');
  });
});

describe('Assignment Title migration (ADR-0262)', () => {
  it('moves purpose into description and derives a Title without losing the old text', () => {
    const home = createTempRoot('botharness-assignment-title-');
    const purpose =
      'Investigate why the nightly search index rebuild takes three hours on staging.\nKeep notes.';
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 108),
      ),
    });
    attachOperationalModule(prior, 'assignment-title-prior').transaction((db) => {
      db.prepare(
        `INSERT INTO session_ownership (session_id, bot_slug, root_role, created_at)
         VALUES ('legacy', 'ada', 'assignment', ?)`,
      ).run(AT);
      db.prepare(
        `INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at)
         VALUES ('legacy-source', 'human-message', 'ada', 'ask', ?)`,
      ).run(AT);
      db.prepare(
        `INSERT INTO assignments (session_id, source_event_id, bot_slug, purpose, activity,
           created_at, updated_at)
         VALUES ('legacy', 'legacy-source', 'ada', ?, 'idle', ?, ?)`,
      ).run(purpose, AT, AT);
    });
    prior.close();

    const current = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      expect(current.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      const port = attachOperationalModule(current, 'assignment-title-current');
      expect(
        port.read((db) =>
          db
            .prepare(`SELECT title, description FROM assignments WHERE session_id = 'legacy'`)
            .get(),
        ),
      ).toEqual({ title: 'Investigate why the nightly search index…', description: purpose });
      const columns = port.read(
        (db) =>
          db.prepare(`SELECT name FROM pragma_table_info('assignments')`).all() as Array<{
            name: string;
          }>,
      );
      expect(columns.map((column) => column.name)).not.toContain('purpose');
    } finally {
      current.close();
    }
  });
});
