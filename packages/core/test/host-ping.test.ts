import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { MIN_PHONE_APP_VERSION } from '../src/devices/client-compat.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

describe('host ping', () => {
  it('reports the Host version so a phone can tell an older computer apart', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-host-ping-') });
    try {
      expect(
        createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, hostVersion: () => '1.7.0' }).ping({}),
      ).toEqual({
        ok: true,
        value: { ok: true, version: '1.7.0', minAppVersion: MIN_PHONE_APP_VERSION },
      });
      expect(createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).ping({})).toEqual({
        ok: true,
        value: { ok: true, minAppVersion: MIN_PHONE_APP_VERSION },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
