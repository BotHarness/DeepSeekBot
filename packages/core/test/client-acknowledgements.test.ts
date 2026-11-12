import { describe, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  requestAssignment() {
    throw new Error('Unexpected Assignment');
  },
  async close() {},
};

describe('Profile notice acknowledgements', () => {
  it('survive a Host restart and refuse unknown keys and malformed versions', async () => {
    const dshHome = createTempRoot('bh-acks-');
    const first = createCore({ dshHome, agents });
    try {
      const bridge = createBridgeMethods({ ...first });
      expect(bridge.acknowledgements({})).toEqual({ ok: true, value: { items: {} } });
      expect(bridge.acknowledge({ key: 'bot-mode-entered' })).toEqual({
        ok: true,
        value: { key: 'bot-mode-entered', value: '1' },
      });
      expect(bridge.acknowledge({ key: 'onboarding-intro', value: '1' }).ok).toBe(true);
      expect(bridge.acknowledge({ key: 'mobile-apps' }).ok).toBe(true);
      expect(bridge.acknowledge({ key: 'onboarding-sessions' }).ok).toBe(true);
      expect(bridge.acknowledge({ key: 'release-notes-seen', value: '1.6.0' }).ok).toBe(true);
      expect(bridge.acknowledge({ key: 'release-notes-seen', value: '1.6.1' }).ok).toBe(true);
      expect(bridge.acknowledge({ key: 'release-update-dismissed/stable/1.6.2' }).ok).toBe(true);
      expect(
        bridge.acknowledge({ key: 'release-update-dismissed/preview/restart-1.7.0-rc.1' }).ok,
      ).toBe(true);
      for (const payload of [
        { key: 'anything-else' },
        { key: 'release-notes-seen' },
        { key: 'release-notes-seen', value: 'latest' },
        { key: 'bot-mode-entered', value: 'yes' },
        { key: 'release-update-dismissed/nightly/1.0.0' },
      ])
        expect(bridge.acknowledge(payload)).toMatchObject({
          ok: false,
          error: { code: 'invalid-input' },
        });
    } finally {
      await first.runtime.close();
      first.operationalDatabase.close();
    }
    const second = createCore({ dshHome, agents });
    try {
      expect(createBridgeMethods({ ...second }).acknowledgements({})).toEqual({
        ok: true,
        value: {
          items: {
            'bot-mode-entered': '1',
            'mobile-apps': '1',
            'onboarding-intro': '1',
            'onboarding-sessions': '1',
            'release-notes-seen': '1.6.1',
            'release-update-dismissed/preview/restart-1.7.0-rc.1': '1',
            'release-update-dismissed/stable/1.6.2': '1',
          },
        },
      });
    } finally {
      await second.runtime.close();
      second.operationalDatabase.close();
    }
  });
});
