import { expect, it } from 'vitest';

import { createBotStateTracker, personaBotActivitySnapshot } from '../src/state/bot-state.js';

it('reports the revision that matches attention synced while the snapshot is built', () => {
  const states = createBotStateTracker();
  let pending = true;
  states.syncDurableAttentionWith(() => {
    if (!pending) return;
    pending = false;
    states.replaceDurableAttention([
      {
        botSlug: 'ada',
        waitingHumanCount: 1,
        blockedCount: 0,
        workspaceGrantCount: 0,
        informationalCount: 0,
      },
    ]);
  });
  const before = states.version();
  const snapshot = personaBotActivitySnapshot(['ada'], states);
  expect(snapshot.bots[0]?.attention?.waitingHumanCount).toBe(1);
  expect(snapshot).toMatchObject(states.version());
  expect(states.version()).not.toEqual(before);
});
