import { expect, it } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

it('refreshes the roster for Assignment reports but not for Assignment activity writes', async () => {
  const core = createCore({ dshHome: createTempRoot('bh-roster-assignment-') });
  const abort = new AbortController();
  const types: string[] = [];
  const following = (async () => {
    for await (const frame of core.live.followRoster(abort.signal)) types.push(frame.type);
  })();
  try {
    const port = attachOperationalModule(core.operationalDatabase, 'assignment-refresh-test');
    await new Promise((resolve) => setTimeout(resolve, 10));
    for (let i = 0; i < 5; i++) port.transaction(() => undefined, ['assignments']);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(types).not.toContain('changed');
    port.transaction(() => undefined, ['assignments', 'assignment-report']);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(types).toContain('changed');
  } finally {
    abort.abort();
    await following;
    core.live.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
