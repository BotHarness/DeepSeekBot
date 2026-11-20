import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PersonaBotRecord } from '../src/bots/persona-bot.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { ApprovalTemplateDeletion } from '../src/workspaces/approval-template-deletion.js';
import { createApprovalTemplateLibrary } from '../src/workspaces/approval-templates.js';

describe('Approval Template deletion persistence budget', () => {
  it.each([20, 80])(
    'persists %i fallbacks with linear owner work and survives reopening',
    (count) => {
      const home = mkdtempSync(join(tmpdir(), 'approval-delete-persistence-'));
      const rootDir = join(home, 'botharness', 'bots');
      let database = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      });
      try {
        const registry = createPersonaBotRegistry({ rootDir, database });
        const records: PersonaBotRecord[] = Array.from({ length: count }, (_, index) => ({
          slug: 'reference-' + index,
          displayName: 'Reference ' + index,
          createdAt: '2026-11-16T00:00:00Z',
          workspaces: [],
          approvalTemplate: 'night-shift',
        }));
        const controls: PersonaBotRecord[] = [
          {
            slug: 'inherit',
            displayName: 'Inherit',
            createdAt: '2026-11-16',
            workspaces: [],
            approvalTemplate: '@global',
          },
          { slug: 'off', displayName: 'Off', createdAt: '2026-11-16', workspaces: [] },
          {
            slug: 'other',
            displayName: 'Other',
            createdAt: '2026-11-16',
            workspaces: [],
            approvalTemplate: 'cautious',
          },
        ];
        attachOperationalModule(database, 'deletion-scale-fixture').transaction((db) => {
          const insert = db.prepare(
            'INSERT INTO persona_bots (slug, body, owner_human_id) VALUES (?, ?, ?)',
          );
          for (const record of [...records, ...controls])
            insert.run(record.slug, JSON.stringify(record), 'local-human');
        });
        const libraryDir = join(home, 'approval-templates');
        const library = createApprovalTemplateLibrary(libraryDir);
        expect(library.create('night-shift', '# Night shift\n')).toMatchObject({ ok: true });
        library.setGlobal('get-work-done');
        const deletion = new ApprovalTemplateDeletion(library, registry, () => true);
        const preview = deletion.preview('night-shift');
        if (!preview.ok) throw new Error(preview.reason);
        expect(preview.preview.affectedBots).toHaveLength(count);
        const before = database.diagnostics().metrics;
        const result = deletion.delete('night-shift', {
          confirmed: true,
          revision: preview.preview.revision,
        });
        const after = database.diagnostics().metrics;
        expect(result).toMatchObject({
          ok: true,
          inheritedBots: expect.arrayContaining(records.map((record) => record.slug)),
        });
        expect(after.transactionsCommitted - before.transactionsCommitted).toBeLessThanOrEqual(
          count,
        );
        const maxRegistryReads = 1 + records.length + controls.length + 2 * count;
        expect(after.reads - before.reads).toBeLessThanOrEqual(maxRegistryReads);
        expect(after.transactionsRolledBack - before.transactionsRolledBack).toBe(0);
        expect(library.get('night-shift')).toBeUndefined();
        expect(library.global()).toEqual({ kind: 'selected', name: 'get-work-done' });
        const savedControls = controls.map((record) => registry.get(record.slug));
        database.close();
        database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
        const reopened = createPersonaBotRegistry({ rootDir, database });
        for (const record of records)
          expect(reopened.get(record.slug)?.approvalTemplate).toBe('@global');
        expect(controls.map((record) => reopened.get(record.slug))).toEqual(savedControls);
        expect(createApprovalTemplateLibrary(libraryDir).global()).toEqual({
          kind: 'selected',
          name: 'get-work-done',
        });
      } finally {
        database.close();
        rmSync(home, { recursive: true, force: true });
      }
    },
  );
});
