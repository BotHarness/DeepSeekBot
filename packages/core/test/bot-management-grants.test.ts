import { expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import { TOB_CLI_PROMPT } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

it('grants independent capabilities to multiple Owner Bots and refreshes their prompt on compaction', async () => {
  const core = createCore({ dshHome: createTempRoot('management-grants-') });
  try {
    const home = await core.tob.ensure();
    expect(core.tob.managementGrants(home.botSlug)).toEqual(['manage-app', 'manage-bots']);
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const owner = createBridgeMethods(OWNER_HUMAN_CONTEXT, core);
    const bot = createBridgeMethods({ ...OWNER_HUMAN_CONTEXT, caller: 'bot' }, core);
    const payload = { slug: 'ada', capability: 'manage-app', enabled: true };
    const prompt = core.tob.bindManagementPrompt('existing-session', 'ada');
    expect(await bot.botGrant(payload)).toMatchObject({ ok: false });
    expect(await owner.botGrant(payload)).toEqual({ ok: true, value: { grants: ['manage-app'] } });
    expect(core.tob.hasManagementGrant(home.botSlug, 'manage-app')).toBe(true);
    expect(core.tob.hasManagementGrant('ada', 'manage-bots')).toBe(false);
    expect(prompt.text()).toBe('');
    core.tob.refreshManagementPrompt('existing-session');
    expect(prompt.text()).toBe(TOB_CLI_PROMPT);
    expect(await owner.botGrant({ ...payload, enabled: false })).toEqual({
      ok: true,
      value: { grants: [] },
    });
    expect(prompt.text()).toBe(TOB_CLI_PROMPT);
    core.tob.refreshManagementPrompt('existing-session');
    expect(prompt.text()).toBe('');
    expect(core.channels.readMessages('dm-ada').map((message) => message.body)).toEqual([
      '[Host timeline] This Bot can no longer manage the App.',
      '[Host timeline] This Bot can now manage the App.',
    ]);
    prompt.dispose();
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
