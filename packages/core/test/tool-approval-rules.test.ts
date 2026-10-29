import { rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createToolApprovalRuleStore } from '../src/workspaces/tool-approval-rules.js';
import { createTempRoot } from './helpers.js';

describe('durable tool approval rules', () => {
  it('retains external provenance across restart and never resurrects disabled creator rules', () => {
    const home = createTempRoot('bh-external-rule-');
    let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let authorized = true;
    const store = () =>
      createToolApprovalRuleStore(
        attachOperationalModule(owner, 'tool-approval-rules'),
        () => authorized,
      );
    const input = {
      botSlug: 'ada',
      role: 'orchestrator' as const,
      scopeKey: 'grant-1',
      toolName: 'bash',
      input: '{"command":"pwd"}',
    };
    const externalCreator = {
      platform: 'feishu' as const,
      bindingId: 'binding',
      fingerprint: 'a'.repeat(64),
      actorId: 'ou_alice',
      pairingId: 'pairing',
      pairingRevision: 2,
      conversationId: 'oc_private',
      messageId: 'om_card',
    };
    try {
      const rule = store().createPending({ ...input, kind: 'exact', externalCreator });
      store().activate('ada', rule.id);
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().match(input)).toMatchObject({ id: rule.id, externalCreator });
      authorized = false;
      store().reconcileExternal('ada');
      expect(store().list('ada')[0]?.revokedAt).toBeDefined();
      authorized = true;
      expect(store().match(input)).toBeUndefined();
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().match(input)).toBeUndefined();
      const web = store().createPending({ ...input, kind: 'exact' });
      store().activate('ada', web.id);
      const another = store().createPending({ ...input, kind: 'exact', externalCreator });
      store().activate('ada', another.id);
      authorized = false;
      expect(store().match(input)?.id).toBe(web.id);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('generation 82 preserves existing Web rule semantics on upgrade', () => {
    const home = createTempRoot('bh-rule-upgrade-');
    let owner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 81),
      ),
    });
    try {
      attachOperationalModule(owner, 'tool-approval-rules').transaction((db) =>
        db
          .prepare(
            "INSERT INTO tool_approval_rules (id,bot_slug,role,scope_key,kind,tool_name,input,created_at,active) VALUES ('legacy','ada','assignment','grant','exact','bash','{}','2026-10-11T00:00:00Z',1)",
          )
          .run(),
      );
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      const store = createToolApprovalRuleStore(
        attachOperationalModule(owner, 'tool-approval-rules'),
        () => false,
      );
      expect(
        store.match({
          botSlug: 'ada',
          role: 'assignment',
          scopeKey: 'grant',
          toolName: 'bash',
          input: '{}',
        }),
      ).toMatchObject({ id: 'legacy' });
      expect(store.list('ada')[0]).not.toHaveProperty('externalCreator');
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('matches exact calls and broad opaque calls within one Bot and scope, then revokes immediately', () => {
    const home = createTempRoot('botharness-tool-rules-');
    let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const store = () =>
      createToolApprovalRuleStore(attachOperationalModule(owner, 'tool-approval-rules'));
    const target = {
      botSlug: 'ada',
      role: 'assignment' as const,
      scopeKey: 'grant-1',
      toolName: 'bash',
      input: '{"command":"pwd"}',
    };
    try {
      const exact = store().createPending({ ...target, kind: 'exact' });
      expect(store().match(target)).toBeUndefined();
      expect(store().list('ada')).toEqual([]);
      store().activate('ada', exact.id);
      expect(
        store()
          .list('ada')
          .map((rule) => rule.id),
      ).toEqual([exact.id]);
      expect(store().match(target)?.id).toBe(exact.id);
      expect(store().match({ ...target, botSlug: 'bob' })).toBeUndefined();
      expect(store().match({ ...target, scopeKey: 'grant-2' })).toBeUndefined();
      expect(store().match({ ...target, input: '{"command":"cat /etc/passwd"}' })).toBeUndefined();
      expect(store().match({ ...target, role: 'orchestrator' })).toBeUndefined();
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().match(target)?.id).toBe(exact.id);
      expect(store().revoke('ada', exact.id)?.revokedAt).toBeDefined();
      expect(store().match(target)).toBeUndefined();
      const broad = store().createPending({
        ...target,
        kind: 'all-opaque',
        toolName: '*',
        input: '',
      });
      store().activate('ada', broad.id);
      expect(store().match({ ...target, toolName: 'run_code', input: '{"code":"1+1"}' })?.id).toBe(
        broad.id,
      );
      expect(store().match({ ...target, scopeKey: 'grant-2' })).toBeUndefined();
      store().revoke('ada', broad.id);
      expect(store().match(target)).toBeUndefined();
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('remembers one tool across inputs and restart, preserving legacy rules and access snapshots', () => {
    const home = createTempRoot('bh-tool-rule-upgrade-');
    let owner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 103),
      ),
    });
    const store = () =>
      createToolApprovalRuleStore(attachOperationalModule(owner, 'tool-approval-rules'));
    const target = {
      botSlug: 'ada',
      role: 'assignment' as const,
      scopeKey: 'grant-1',
      toolName: 'bash',
      input: '{"command":"pwd"}',
    };
    try {
      const legacy = store().createPending({ ...target, kind: 'exact' });
      store().activate('ada', legacy.id);
      attachOperationalModule(owner, 'assignments').transaction((db) =>
        db.exec(`
        INSERT INTO session_ownership (session_id,bot_slug,root_role,created_at) VALUES ('full','ada','assignment','2026-10-20');
        INSERT INTO source_events (source_event_id,bot_slug,source_kind,body,created_at) VALUES ('source','ada','human-message','QA','2026-10-20');
        INSERT INTO workspace_grants (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at)
          VALUES ('grant-1','ada','workspace','/qa','QA','2026-10-20');
        INSERT INTO assignments (session_id,source_event_id,bot_slug,purpose,activity,created_at,updated_at,
          grant_id,workspace_id,primary_cwd,permission_mode,approval_policy,preset_revision)
          VALUES ('full','source','ada','QA','idle','2026-10-20','2026-10-20','grant-1','workspace','/qa','danger-full-access','never',7);
      `),
      );
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().match(target)?.id).toBe(legacy.id);
      expect(store().match({ ...target, input: '{"command":"changed"}' })).toBeUndefined();
      const snapshot = attachOperationalModule(owner, 'assignments').read((db) =>
        db
          .prepare(
            'SELECT grant_id, permission_mode, approval_policy, preset_revision FROM assignments WHERE session_id = ?',
          )
          .get('full'),
      );
      expect(snapshot).toEqual({
        grant_id: 'grant-1',
        permission_mode: 'danger-full-access',
        approval_policy: 'ask',
        preset_revision: 7,
      });
      const rule = store().createPending({ ...target, kind: 'tool', input: '' });
      store().activate('ada', rule.id);
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().match({ ...target, input: '{"command":"changed"}' })?.id).toBe(rule.id);
      for (const changed of [
        { toolName: 'pwsh' },
        { botSlug: 'bob' },
        { scopeKey: 'grant-2' },
        { role: 'orchestrator' as const },
      ]) {
        expect(store().match({ ...target, ...changed, input: 'different' })).toBeUndefined();
      }
      store().revoke('ada', rule.id);
      expect(store().match({ ...target, input: 'different' })).toBeUndefined();
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
  it('counts each request a rule answers and keeps the count across restart', () => {
    const home = createTempRoot('bh-rule-count-');
    let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const store = () =>
      createToolApprovalRuleStore(attachOperationalModule(owner, 'tool-approval-rules'));
    const input = {
      botSlug: 'ada',
      role: 'orchestrator' as const,
      scopeKey: 'grant-1',
      toolName: 'bash',
      input: '{"command":"pwd"}',
    };
    try {
      const rule = store().createPending({ ...input, kind: 'exact' });
      expect(rule.autoApprovedCount).toBe(0);
      store().activate('ada', rule.id);
      store().recordAutoApproval('ada', rule.id);
      store().recordAutoApproval('ada', rule.id);
      store().recordAutoApproval('grace', rule.id);
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(store().list('ada')).toMatchObject([{ id: rule.id, autoApprovedCount: 2 }]);
      expect(store().match(input)).toMatchObject({ autoApprovedCount: 2 });
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('generation 110 starts existing rules at zero auto approvals', () => {
    const home = createTempRoot('bh-rule-count-upgrade-');
    let owner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 110),
      ),
    });
    try {
      attachOperationalModule(owner, 'tool-approval-rules').transaction((db) =>
        db
          .prepare(
            "INSERT INTO tool_approval_rules (id,bot_slug,role,scope_key,kind,tool_name,input,created_at,active) VALUES ('legacy','ada','assignment','grant','tool','bash','','2026-10-11T00:00:00Z',1)",
          )
          .run(),
      );
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      const rules = createToolApprovalRuleStore(
        attachOperationalModule(owner, 'tool-approval-rules'),
      );
      expect(rules.list('ada')).toMatchObject([{ id: 'legacy', autoApprovedCount: 0 }]);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
