import { describe, expect, it } from 'vitest';
import {
  decideToolApproval,
  toolEffects,
  toolApprovalRequired,
  type ToolApprovalContext,
  type ToolEffects,
} from '../src/workspaces/tool-effects.js';

describe('public tool effects', () => {
  it.each([{}, { humanId: 'alice', topic: 'publishing' }])(
    'keeps speaker policy lookup read-only with existing admission for %j',
    (args) => {
      expect(toolEffects('speaker_policy', args)).toEqual({
        changes: 'none',
        reach: 'local',
        personalData: true,
      });
      expect(toolApprovalRequired('speaker_policy', args, false)).toBe(false);
      expect(toolApprovalRequired('speaker_policy', args, true)).toBe(false);
    },
  );
  it.each(['GET', 'get', 'GeT'])('uses HTTP execution normalization for %s', (method) => {
    expect(toolEffects('secret_http', { method })).toEqual({
      changes: 'none',
      reach: 'external',
      personalData: true,
      secrets: true,
    });
  });
  it('includes request delivery when restoring an Assignment with a message', () => {
    expect(toolEffects('unarchive_assignment', { session_id: 'assignment-1' })).toEqual({
      changes: 'reversible',
      reach: 'local',
      personalData: true,
    });
    expect(
      toolEffects('unarchive_assignment', {
        session_id: 'assignment-1',
        message: 'Continue the approved task.',
      }),
    ).toEqual({ changes: 'irreversible', reach: 'external', personalData: true });
  });
  it.each([
    ['group', 'external'],
    ['nearby', 'external'],
    ['thread', 'external'],
    ['retained', 'local'],
    ['retained-nearby', 'local'],
  ] as const)('declares %s context with %s reach', (scope, reach) => {
    expect(toolEffects('bridge_context', { scope })).toEqual({
      changes: 'none',
      reach,
      personalData: true,
    });
  });
  it.each([
    [
      'secret_http',
      { method: 'GET' },
      { changes: 'none', reach: 'external', personalData: true, secrets: true },
    ],
    [
      'secret_http',
      { method: 'POST' },
      { changes: 'irreversible', reach: 'external', personalData: true, secrets: true },
    ],
    [
      'browser_tabs',
      { action: 'close' },
      { changes: 'irreversible', reach: 'local', personalData: true },
    ],
  ] as const)('resolves mixed-purpose effects for %s %j', (name, input, expected) => {
    expect(toolEffects(name, input)).toEqual(expected);
  });
  it.each([
    ['channel_read', {}, { changes: 'none', reach: 'local', personalData: true }],
    [
      'channel_attachment_open',
      { access: 'read' },
      { changes: 'none', reach: 'local', personalData: true },
    ],
    [
      'channel_attachment_open',
      { access: 'write' },
      { changes: 'reversible', reach: 'local', personalData: true },
    ],
    ['memory_switch_branch', {}, { changes: 'reversible', reach: 'memory', personalData: true }],
    [
      'channel_attachment_save',
      {},
      { changes: 'reversible', reach: 'workspace', personalData: true },
    ],
    ['bot_send_message', {}, { changes: 'irreversible', reach: 'external', personalData: true }],
    [
      'secret_cli',
      {},
      { changes: 'irreversible', reach: 'external', personalData: true, secrets: true },
    ],
    [
      'cloud_work',
      { operation: 'inspect' },
      { changes: 'none', reach: 'local', personalData: true },
    ],
    [
      'channel_action',
      { action: 'inspect' },
      { changes: 'none', reach: 'local', personalData: true },
    ],
    [
      'channel_action',
      { action: 'drop' },
      { changes: 'reversible', reach: 'local', personalData: true },
    ],
    [
      'browser_tabs',
      { action: 'select' },
      { changes: 'reversible', reach: 'local', personalData: true },
    ],
    ['browser_tabs', { action: 'list' }, { changes: 'none', reach: 'local', personalData: true }],
  ] as const)('resolves author effects for %s with %j', (name, args, expected) => {
    expect(toolEffects(name, args)).toEqual(expected);
  });
  it.each(['bash', 'pwsh', 'third_party_tool', 'toString'])(
    'retains undeclared provenance for %s',
    (name) => {
      expect(toolEffects(name, { command: 'send everything' })).toBeUndefined();
      expect(
        decideToolApproval(undefined, {
          stage: 'admission',
          admission: 'native',
          legacyProtected: false,
        }),
      ).toMatchObject({ path: 'native', reason: 'undeclared-native' });
    },
  );
});

const request = {
  stage: 'request',
  fullAccess: false,
  eachUse: false,
  explicitApproval: false,
  legacyProtected: false,
  device: false,
  standingRule: 'none',
  reviewer: false,
  rememberable: false,
} satisfies ToolApprovalContext;
const local: ToolEffects = { changes: 'none', reach: 'local', personalData: false };
const external: ToolEffects = { changes: 'irreversible', reach: 'external', personalData: true };

describe('E1 pure approval decision', () => {
  it.each([
    [local, { fullAccess: true }, 'full-access', true, false, 'full-access-existing'],
    [external, { fullAccess: true }, 'full-access', true, false, 'full-access-existing'],
    [
      { ...external, secrets: true },
      { fullAccess: true },
      'full-access',
      true,
      false,
      'full-access-existing',
    ],
    [
      { ...local, authority: 'management' },
      { fullAccess: true, reviewer: true },
      'human',
      true,
      true,
      'protected-operation',
    ],
    [
      { ...local, authority: 'management' },
      { standingRule: 'explicit', reviewer: true },
      'standing-rule',
      true,
      true,
      'saved-authorization',
    ],
    [
      { ...local, authority: 'management' },
      { standingRule: 'ordinary', fullAccess: true, reviewer: true },
      'human',
      true,
      true,
      'protected-operation',
    ],
    [
      undefined,
      { legacyProtected: true, fullAccess: true, reviewer: true },
      'human',
      true,
      true,
      'protected-operation',
    ],
    [
      external,
      { standingRule: 'ordinary', reviewer: true },
      'standing-rule',
      true,
      false,
      'saved-authorization',
    ],
    [external, { reviewer: true }, 'reviewer', true, false, 'template-review'],
    [external, {}, 'human', true, false, 'human-required'],
    [
      external,
      { eachUse: true, fullAccess: true, standingRule: 'ordinary' },
      'human',
      false,
      false,
      'human-required',
    ],
    [external, { eachUse: true, rememberable: true }, 'human', true, false, 'human-required'],
    [
      local,
      { device: true, standingRule: 'explicit' },
      'standing-rule',
      true,
      true,
      'saved-authorization',
    ],
    [
      local,
      { explicitApproval: true, fullAccess: true, reviewer: true },
      'human',
      true,
      true,
      'protected-operation',
    ],
  ] as const)(
    'routes effects %j and context %j',
    (effects, context, path, rememberable, explicitRule, reason) => {
      expect(decideToolApproval(effects, { ...request, ...context })).toEqual({
        path,
        rememberable,
        explicitRule,
        reason,
      });
    },
  );
});
