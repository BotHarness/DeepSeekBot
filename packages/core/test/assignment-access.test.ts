import { rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createAssignmentAccessStore } from '../src/workspaces/assignment-access.js';
import { createTempRoot } from './helpers.js';

describe('per-Bot Assignment access preset', () => {
  it('starts safe, audits Human changes, persists revisions, and leaves snapshots independent', () => {
    const home = createTempRoot('botharness-access-');
    let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const store = () =>
      createAssignmentAccessStore(attachOperationalModule(owner, 'assignment-access'));
    try {
      const oldSnapshot = store().get('ada');
      expect(oldSnapshot).toEqual({
        botSlug: 'ada',
        mode: 'workspace-write',
        scope: 'chat',
        revision: 0,
      });
      expect(store().get('bob').mode).toBe('workspace-write');
      const dangerous = store().set('ada', 'danger-full-access');
      expect(dangerous).toMatchObject({ mode: 'danger-full-access', scope: 'chat', revision: 1 });
      expect(store().set('ada', 'danger-full-access')).toEqual(dangerous);
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().get('ada')).toEqual(dangerous);
      expect(store().set('ada', 'workspace-write')).toMatchObject({
        mode: 'workspace-write',
        revision: 2,
      });
      expect(oldSnapshot).toMatchObject({ mode: 'workspace-write', revision: 0 });
      const events = attachOperationalModule(owner, 'assignment-access').read((database) =>
        database
          .prepare(
            'SELECT prior_mode, mode, actor_kind FROM bot_assignment_access_events WHERE bot_slug = ? ORDER BY revision',
          )
          .all('ada'),
      );
      expect(events).toEqual([
        { prior_mode: 'workspace-write', mode: 'danger-full-access', actor_kind: 'human' },
        { prior_mode: 'danger-full-access', mode: 'workspace-write', actor_kind: 'human' },
      ]);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('switches the scope of full access between the chat Session and Assignments only', () => {
    const home = createTempRoot('botharness-access-scope-');
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const store = createAssignmentAccessStore(attachOperationalModule(owner, 'assignment-access'));
    try {
      expect(store.set('ada', 'danger-full-access')).toMatchObject({ scope: 'chat', revision: 1 });
      const narrowed = store.set('ada', 'danger-full-access', 'assignments');
      expect(narrowed).toMatchObject({ scope: 'assignments', revision: 2 });
      expect(store.set('ada', 'danger-full-access', 'assignments')).toEqual(narrowed);
      expect(store.get('ada')).toEqual(narrowed);
      expect(store.set('ada', 'danger-full-access', 'chat')).toMatchObject({
        scope: 'chat',
        revision: 3,
      });
      expect(() => store.set('ada', 'danger-full-access', 'everything' as never)).toThrow(
        TypeError,
      );
    } finally {
      owner.close();
    }
  });
});
