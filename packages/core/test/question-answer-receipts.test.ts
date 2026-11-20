import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { questionAnswerReceipts } from '../src/channels/question-answer-receipts.js';
import { createTempRoot } from './helpers.js';

const answer = { answers: [{ id: 'plan', selected: ['CONFIDENTIAL_ANSWER'] }] };
describe('question answer submission Source Events', () => {
  it('survives restart without adding Channel messages or model content and retains withdrawal facts', async () => {
    const home = createTempRoot('question-receipts-');
    let core = createCore({ dshHome: home });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada');
      if (!dm) throw new Error('Missing test DM');
      let database = attachOperationalModule(core.operationalDatabase, 'messaging');
      const store = questionAnswerReceipts(
        attachOperationalModule(core.operationalDatabase, 'messaging'),
        () => 'ada',
      );
      const revision = core.channels.revision(dm.id);
      store.save('session', 'call', answer, OWNER_HUMAN_CONTEXT);
      expect(core.channels.readMessages(dm.id)).toEqual([]);
      expect(core.channels.revision(dm.id)).toBe(revision);
      const payloads = database.read((db) =>
        db
          .prepare(
            "SELECT payload_json FROM source_events WHERE source_event_id LIKE 'question-answer:%'",
          )
          .all(),
      );
      expect(JSON.stringify(payloads)).not.toContain('CONFIDENTIAL_ANSWER');
      await core.runtime.close();
      core.operationalDatabase.close();
      core = createCore({ dshHome: home });
      database = attachOperationalModule(core.operationalDatabase, 'messaging');
      const restored = questionAnswerReceipts(
        attachOperationalModule(core.operationalDatabase, 'messaging'),
        () => 'ada',
      );
      const before = core.operationalDatabase.diagnostics().metrics.reads;
      expect(restored.read('session', 'call')).toMatchObject({
        humanId: OWNER_HUMAN_CONTEXT.humanId,
      });
      expect(core.operationalDatabase.diagnostics().metrics.reads - before).toBe(1);
      expect(restored.read('other-session', 'call')).toBeUndefined();
      restored.discard('session', 'call');
      expect(restored.read('session', 'call')).toMatchObject({ humanId: null });
      expect(
        database.read(
          (db) =>
            db
              .prepare(
                "SELECT COUNT(*) AS count FROM source_events WHERE source_event_id LIKE 'question-answer:%'",
              )
              .get()?.count,
        ),
      ).toBe(2);
      expect(core.humanAttention.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toEqual(
        [],
      );
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
