import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSecretMcpStore } from '../src/credentials/secret-mcp-store.js';
import { createTempRoot } from './helpers.js';

describe('remembered secret MCP servers', () => {
  it('keeps one record per Bot and server across a reopen, replaces it, and forgets it', () => {
    const home = createTempRoot('botharness-secret-mcp-');
    let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const store = () => createSecretMcpStore(attachOperationalModule(owner, 'secret-mcp'));
    const input = {
      botSlug: 'ada',
      serverName: 'github',
      account: 'GitHub token',
      program: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: [{ name: 'GITHUB_TOKEN', value: '{{token}}' }],
      references: ['private:00000000-0000-4000-8000-000000000001:token'],
    };
    try {
      expect(store().list('ada')).toEqual([]);
      const saved = store().put(input);
      expect(saved).toMatchObject(input);
      store().put({ ...input, botSlug: 'bob' });
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().list('ada')).toEqual([saved]);
      expect(
        store()
          .listAll()
          .map((entry) => entry.botSlug)
          .sort(),
      ).toEqual(['ada', 'bob']);
      expect(
        store()
          .enabled('bob')
          .map((entry) => entry.botSlug),
      ).toEqual(['bob']);
      expect(store().isEnabled('carol', saved)).toBe(false);
      store().setEnabled('carol', 'ada', 'github', true);
      store().setEnabled('carol', 'ada', 'github', true);
      expect(store().isEnabled('carol', saved)).toBe(true);
      expect(
        store()
          .enabled('carol')
          .map((entry) => entry.botSlug),
      ).toEqual(['ada']);
      store().setEnabled('carol', 'ada', 'github', false);
      expect(store().enabled('carol')).toEqual([]);
      store().setEnabled('carol', 'ada', 'github', true);
      store().put({ ...input, args: ['-y', 'other-server'] });
      expect(store().list('ada')).toHaveLength(1);
      expect(store().list('ada')[0]?.args).toEqual(['-y', 'other-server']);
      expect(JSON.stringify(store().list('ada'))).not.toMatch(/SYNTHETIC|secret-value/);
      expect(store().remove('ada', 'github')).toBe(true);
      expect(store().remove('ada', 'github')).toBe(false);
      expect(store().enabled('carol')).toEqual([]);
      expect(store().list('ada')).toEqual([]);
      store().eraseBot('bob');
      expect(store().list('bob')).toEqual([]);
    } finally {
      owner.close();
    }
  });
});
