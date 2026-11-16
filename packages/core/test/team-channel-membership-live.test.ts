import { expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';

it('publishes a roster change to an already-connected invitee without needing another message', async () => {
  const core = createCore({ dshHome: createTempRoot('m14-invite-live-') });
  const human = humanContext('invitee');
  const abort = new AbortController();
  const stream = core.live.followRoster(human, abort.signal)[Symbol.asyncIterator]();
  try {
    attachOperationalModule(core.operationalDatabase, 'm14-test').transaction((db) => {
      db.prepare("INSERT INTO humans VALUES ('invitee', 'Invitee', 'active', 'before')").run();
      db.prepare("INSERT INTO human_roles VALUES ('invitee', 'member')").run();
    });
    const group = core.channels.createGroup(owner, { name: 'Private invitation', members: [] });
    expect(core.team.channelAccess.canRead(human, group.id, true)).toBe(false);
    expect((await stream.next()).value).toMatchObject({ type: 'baseline' });
    let delivered = false;
    const next = stream.next().then((result) => {
      expect(result.value).toMatchObject({ type: 'changed' });
      delivered = true;
    });
    try {
      core.team.channelAccess.addMember(owner, group.id, human.humanId);
      await vi.waitFor(() => expect(delivered).toBe(true), { timeout: 2000 });
      expect(core.team.channelAccess.visibleIds(human).has(group.id)).toBe(true);
    } finally {
      abort.abort();
      await next;
    }
  } finally {
    abort.abort();
    await stream.return?.();
    core.live.close();
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
