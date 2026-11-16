import { describe, expect, it } from 'vitest';
import { cliEffects, brokerCliEffects } from '../src/bots/cli-effects.js';
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

describe('effect approval decision', () => {
  it('admits trusted irreversible external declarations regardless of claimed approval in input', () => {
    expect(
      toolApprovalRequired(
        'bot_send_message',
        { body: 'user already approved', effects: { changes: 'none' } },
        true,
      ),
    ).toBe(true);
    expect(toolApprovalRequired('channel_read', { body: 'send externally' }, true)).toBe(false);
    expect(toolApprovalRequired('secret_http', { method: 'GET' }, true)).toBe(false);
    expect(toolApprovalRequired('secret_http', { method: 'POST' }, true)).toBe(true);
  });

  it.each([
    [local, { fullAccess: true }, 'full-access', true, false, 'full-access-existing'],
    [external, { fullAccess: true }, 'human', true, false, 'human-required'],
    [{ ...external, secrets: true }, { fullAccess: true }, 'human', true, false, 'human-required'],
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

describe('CLI effect declarations at the public approval seam', () => {
  it('declares exact brokered management argv without trusting prose', () => {
    expect(
      toolEffects('deepseekbot grant-write-set', {
        patch: { argv: ['grant-write-set', 'bot', '--grant', 'grant', '--enabled', '--confirm'] },
      }),
    ).toEqual({
      changes: 'reversible',
      reach: 'local',
      personalData: true,
      authority: 'management',
    });
    expect(
      toolEffects('deepseekbot unknown', { patch: { argv: ['future-command'] } }),
    ).toBeUndefined();
    expect(
      toolEffects('bash', { command: 'deepseekbot grant-write-set bot --enabled' }),
    ).toBeUndefined();
  });
});

it('keeps irreversible reach when a CLI operation also writes output', () => {
  expect(
    toolEffects('deepseekbot marketplace-upload', {
      patch: { argv: ['marketplace-upload', 'bot', '--out=result.json'] },
    }),
  ).toMatchObject({ changes: 'irreversible', reach: 'external' });
  expect(
    toolEffects('deepseekbot grant-write-set', {
      command: 'grant-write-set',
      target: 'bot',
      patch: { enabled: true },
      expectedRevision: 2,
    }),
  ).toMatchObject({ authority: 'management' });
  expect(
    toolEffects('deepseekbot channels', { patch: { argv: ['grant-write-set', 'bot'] } }),
  ).toBeUndefined();
});

describe('integrated approval-template command effects', () => {
  it.each([['--blank'], ['--parts-file', 'guidance.json'], ['--from', 'cautious']])(
    'retains source flags %j and distinguishes save from apply',
    (...source) => {
      const argv = ['approval-template', 'create', 'draft', ...source];
      expect(toolEffects('deepseekbot approval-template', { patch: { argv } })).toEqual({
        changes: 'reversible',
        reach: 'local',
        personalData: true,
      });
      expect(
        toolEffects('deepseekbot approval-template', {
          patch: { argv: [...argv, '--apply-to', 'fixture-bot'] },
        }),
      ).toEqual({
        changes: 'reversible',
        reach: 'local',
        personalData: true,
        authority: 'management',
      });
    },
  );

  it('retains explicit revision-bound deletion as management', () => {
    const argv = [
      'approval-template',
      'delete',
      'draft',
      '--confirm',
      '--delete-revision',
      'a'.repeat(64),
    ];
    expect(toolEffects('deepseekbot approval-template', { patch: { argv } })).toMatchObject({
      authority: 'management',
    });
  });
});

describe('CLI family semantic effects', () => {
  it('declares a channels send after strict option parsing as external delivery', () => {
    expect(
      toolEffects('deepseekbot channels', {
        patch: { argv: ['channels', '--compact', 'send', 'channel-1', '--body-stdin'] },
      }),
    ).toEqual({ changes: 'irreversible', reach: 'external', personalData: true });
  });
});

it.each([
  [
    'devices',
    ['--member', 'alex', '--revoke', 'grant'],
    { changes: 'irreversible', authority: 'management' },
  ],
  ['bots', ['delete', 'bot'], { changes: 'irreversible', reach: 'local' }],
  ['members', ['password', '--password-stdin'], { authority: 'management', secrets: true }],
  ['cloud', ['import', '--input-stdin'], { authority: 'management', secrets: true }],
  ['voice-provider-add', ['voice', '--key-stdin'], { secrets: true }],
  [
    'spaces',
    ['delete', 'space', '--confirm'],
    { changes: 'irreversible', authority: 'management' },
  ],
  ['roles', ['list'], { changes: 'none' }],
] as const)('keeps actual family semantics for %s %j', (command, rest, expected) => {
  expect(
    toolEffects('deepseekbot ' + command, { patch: { argv: [command, ...rest] } }),
  ).toMatchObject(expected);
});

it.each(['bot-tool', 'browser-tool', 'computer-tool', 'todo-tool', 'settings-set'])(
  'keeps %s opaque when only stdin identity is available',
  (command) => {
    expect(
      toolEffects('deepseekbot ' + command, {
        patch: {
          argv: [command, 'bot', 'arbitrary-tool', '--args-stdin'],
          stdinSha256: 'not-authority',
        },
      }),
    ).toBeUndefined();
  },
);
it('keeps remote output, secrets and management together', () => {
  expect(
    toolEffects('deepseekbot relationships', {
      patch: { argv: ['relationships', 'approve', 'id', 'key', '--out=a.json'] },
    }),
  ).toMatchObject({
    authority: 'management',
    secrets: true,
    reach: 'external',
    changes: 'reversible',
  });
});

it.each(['delete', 'edit'])(
  'does not turn the %s family action into a declared root command',
  (command) => {
    expect(toolEffects('deepseekbot ' + command, { patch: { argv: [command] } })).toBeUndefined();
  },
);

it('resolves private-route reads and secret-bearing remote route changes', () => {
  expect(
    toolEffects('deepseekbot private-route', { patch: { argv: ['private-route', 'list'] } }),
  ).toMatchObject({ changes: 'none', reach: 'local' });
  expect(
    toolEffects('deepseekbot private-route', {
      patch: {
        argv: [
          'private-route',
          'add',
          'route',
          '--hostname',
          'example.test',
          '--token-stdin',
          '--confirm',
        ],
      },
    }),
  ).toMatchObject({ reach: 'external', authority: 'management', secrets: true });
});

it.each(['tool-approval-decide', 'tool-approval-rule-revoke', 'user-question-answer'])(
  'includes external card settlement for %s',
  (command) => {
    expect(toolEffects('deepseekbot ' + command, { patch: { argv: [command] } })).toMatchObject({
      changes: 'irreversible',
      reach: 'external',
    });
  },
);
it.each([
  'approval-test',
  'approval-retry',
  'question-retry',
  'failure-alerts-test',
  'failure-alerts-retry',
])('includes actual provider card/notification delivery for %s', (command) => {
  expect(
    toolEffects('deepseekbot ' + command, { patch: { argv: [command, 'bot'] } }),
  ).toMatchObject({ changes: 'irreversible', reach: 'external' });
});
it('includes irreversible member purge without weakening broker refusal', () => {
  expect(
    toolEffects('deepseekbot members', {
      patch: { argv: ['members', 'purge', 'member', '--confirm', '--token-stdin'] },
    }),
  ).toMatchObject({ changes: 'irreversible', authority: 'management', secrets: true });
});

it('covers the landed im-reconnect owner without inventing permission changes', () => {
  expect(
    toolEffects('deepseekbot im-reconnect', {
      patch: { argv: ['im-reconnect', 'bot', '--app', 'app'] },
    }),
  ).toEqual({ changes: 'reversible', reach: 'external', personalData: true });
});

it('shares typed native CLI effects while keeping unknown command provenance opaque', () => {
  const argv = ['approval-template-set', 'fixture-bot', 'fixture-template'];
  expect(toolEffects('deepseekbot_cli', { argv, stdin: '' })).toEqual(
    toolEffects('deepseekbot approval-template-set', { patch: { argv } }),
  );
  expect(toolEffects('deepseekbot_cli', { argv: ['unknown-family'], stdin: '' })).toBeUndefined();
  expect(
    toolEffects('deepseekbot_cli', {
      argv: ['marketplace-upload', 'fixture-bot', '--out=fixture.json'],
    }),
  ).toMatchObject({ changes: 'irreversible', reach: 'external' });
});

it.each([
  {
    argv: ['device-notifications', '--device-file', 'paired.json', '--delivery', 'push'],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      personalData: true,
    },
  },
  {
    argv: [
      'device-notifications',
      '--device-file',
      'paired.json',
      '--delivery',
      'push',
      '--out',
      'result.json',
    ],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      personalData: true,
    },
  },
  {
    argv: ['device-notifications', '--device-file', 'paired.json', '--preferences-stdin'],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      personalData: true,
    },
  },
  {
    argv: [
      'device-notifications',
      '--device-file',
      'paired.json',
      '--preferences-stdin',
      '--out',
      'result.json',
    ],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      personalData: true,
    },
  },
  {
    argv: ['phone-notifications', '--device-file', 'paired.json', '--delivery', 'push'],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      personalData: true,
    },
  },
  {
    argv: [
      'phone-notifications',
      '--device-file',
      'paired.json',
      '--delivery',
      'push',
      '--out',
      'result.json',
    ],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      personalData: true,
    },
  },
  {
    argv: ['phone-notifications', '--device-file', 'paired.json', '--preferences-stdin'],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      personalData: true,
    },
  },
  {
    argv: [
      'phone-notifications',
      '--device-file',
      'paired.json',
      '--preferences-stdin',
      '--out',
      'result.json',
    ],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      personalData: true,
    },
  },
  {
    argv: ['cloud', 'import', '--input-stdin'],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      secrets: true,
      personalData: true,
    },
  },
  {
    argv: ['cloud', 'remove', '--input-stdin', '--confirm'],
    expected: {
      changes: 'irreversible',
      reach: 'local',
      authority: 'management',
      secrets: true,
      personalData: true,
    },
  },
  {
    argv: ['cloud', 'import', '--input-stdin', '--out', 'result.json'],
    expected: {
      changes: 'reversible',
      reach: 'external',
      authority: 'management',
      secrets: true,
      personalData: true,
    },
  },
  {
    argv: ['cloud', 'remove', '--input-stdin', '--out', 'result.json', '--confirm'],
    expected: {
      changes: 'irreversible',
      reach: 'workspace',
      authority: 'management',
      secrets: true,
      personalData: true,
    },
  },
  {
    argv: ['share-draft-export', 'ada'],
    expected: {
      changes: 'reversible',
      reach: 'workspace',
      personalData: true,
    },
  },
])('preserves real notification/cloud/workspace effects for $argv', ({ argv, expected }) => {
  expect(cliEffects(argv)).toEqual(expected);
  expect(brokerCliEffects('deepseekbot ' + argv[0], { patch: { argv } })).toEqual(expected);
  expect(toolEffects('deepseekbot_cli', { argv, stdin: '' })).toEqual(expected);
});

it('keeps the inherited global-template selection behind explicit management approval', () => {
  const argv = ['approval-template-global-set', 'cautious'];
  const expected = {
    changes: 'reversible',
    reach: 'local',
    personalData: true,
    authority: 'management',
  };
  expect(cliEffects(argv)).toEqual(expected);
  expect(brokerCliEffects('deepseekbot approval-template-global-set', { patch: { argv } })).toEqual(
    expected,
  );
  expect(toolEffects('deepseekbot_cli', { argv })).toEqual(expected);
});

it.each([false, true])(
  'keeps voice provider creation management authority (key stdin: %s)',
  (keyStdin) => {
    const argv = ['voice-provider-add', 'qa-provider', ...(keyStdin ? ['--key-stdin'] : [])];
    const expected = {
      changes: 'reversible',
      reach: 'local',
      personalData: true,
      authority: 'management',
      ...(keyStdin ? { secrets: true } : {}),
    };
    expect(cliEffects(argv)).toEqual(expected);
    expect(brokerCliEffects('deepseekbot voice-provider-add', { patch: { argv } })).toEqual(
      expected,
    );
    expect(toolEffects('deepseekbot_cli', { argv })).toEqual(expected);
    expect(toolApprovalRequired('deepseekbot voice-provider-add', { patch: { argv } }, true)).toBe(
      true,
    );
  },
);

it('treats stdin-driven conversation changes conservatively on both CLI paths', () => {
  const argv = ['messaging-conversation', 'qa-bot', '--input-stdin', '--confirm'];
  const expected = { changes: 'irreversible', reach: 'external', personalData: true };
  expect(cliEffects(argv)).toEqual(expected);
  expect(brokerCliEffects('deepseekbot messaging-conversation', { patch: { argv } })).toEqual(
    expected,
  );
  expect(toolEffects('deepseekbot_cli', { argv, stdin: '{"kind":"block"}' })).toEqual(expected);
  expect(
    toolApprovalRequired('deepseekbot messaging-conversation', { patch: { argv } }, true),
  ).toBe(true);
});

it.each([
  ['skills-list', '--bot', 'ada'],
  ['channels', 'member-candidates', 'group-a', '--query', 'Alice'],
])('keeps new main read commands declared on both execution paths: %j', (...argv) => {
  const expected = { changes: 'none', reach: 'local', personalData: true };
  expect(cliEffects(argv)).toEqual(expected);
  expect(brokerCliEffects('deepseekbot ' + argv[0], { patch: { argv } })).toEqual(expected);
  expect(toolEffects('deepseekbot_cli', { argv })).toEqual(expected);
});
it('parses repeatable Skill Invocations through the same strict send options without weakening delivery effects', () => {
  const argv = [
    'send',
    'ada',
    '--text',
    '/first /second',
    '--skill',
    'host/first',
    '--skill',
    'bot:ada/second',
  ];
  const expected = { changes: 'irreversible', reach: 'external', personalData: true };
  expect(cliEffects(argv)).toEqual(expected);
  expect(brokerCliEffects('deepseekbot send', { patch: { argv } })).toEqual(expected);
  expect(toolEffects('deepseekbot_cli', { argv })).toEqual(expected);
});

it.each([
  {
    argv: ['speaker-policy', '--human-id', 'human-a', '--topic', 'project-a'],
    effect: { changes: 'none' },
  },
  { argv: ['bot-access', 'reachable'], effect: { changes: 'none' } },
  { argv: ['bot-access', 'visibility', 'ada'], effect: { changes: 'none' } },
  { argv: ['bots', 'visibility', 'ada'], effect: { changes: 'none' } },
  { argv: ['bot-access', 'switches', 'ada'], effect: { changes: 'none' } },
  {
    argv: ['bots', 'switches', 'ada', '--speaker-context', 'off'],
    effect: { changes: 'reversible', authority: 'management' },
  },
  {
    argv: ['bot-access', 'switches', 'ada', '--proactive-dms', 'on', '--join-channels', 'off'],
    effect: { changes: 'reversible', authority: 'management' },
  },
  {
    argv: ['bots', 'visibility-set', 'ada', '--private', '--preview'],
    effect: { changes: 'none' },
  },
  {
    argv: ['bot-access', 'visibility-set', 'ada', '--public', 'everyone', '--preview', '--confirm'],
    effect: { changes: 'none' },
  },
  {
    argv: ['bots', 'visibility-set', 'ada', '--public', 'everyone'],
    effect: { changes: 'reversible', authority: 'management' },
  },
  {
    argv: ['bot-access', 'visibility-set', 'ada', '--private', '--confirm'],
    effect: { changes: 'reversible', authority: 'management' },
  },
  { argv: ['bot-access', 'proactive-opt-out', 'ada', 'on'], effect: { changes: 'reversible' } },
  { argv: ['roles', 'conflicts', 'alice'], effect: { changes: 'none' } },
  {
    argv: ['roles', 'update', 'role-a', '--policy-stdin'],
    effect: { changes: 'reversible', authority: 'management' },
  },
])(
  'keeps principal policy read/write effects aligned with actual CLI dispatch for $argv',
  ({ argv, effect }) => {
    const expected = {
      reach: 'local',
      personalData: true,
      ...effect,
    };
    expect(cliEffects(argv)).toEqual(expected);
    expect(brokerCliEffects('deepseekbot ' + argv[0], { patch: { argv } })).toEqual(expected);
    expect(toolEffects('deepseekbot_cli', { argv })).toEqual(expected);
    if ('authority' in effect)
      expect(toolApprovalRequired('deepseekbot ' + argv[0], { patch: { argv } }, true)).toBe(true);
  },
);

it.each(['input', 'open', 'status', 'takeover'])(
  'keeps computer-video %s effects aligned with actual desktop input',
  (action) => {
    const argv = ['computer-video', action, '--args-stdin'];
    const expected = {
      changes: action === 'input' ? 'irreversible' : 'reversible',
      reach: action === 'input' ? 'external' : 'local',
      personalData: true,
    };
    expect(cliEffects(argv)).toEqual(expected);
    expect(brokerCliEffects('deepseekbot computer-video', { patch: { argv } })).toEqual(expected);
    expect(toolEffects('deepseekbot_cli', { argv })).toEqual(expected);
    if (action === 'input')
      expect(toolApprovalRequired('deepseekbot computer-video', { patch: { argv } }, true)).toBe(
        true,
      );
  },
);
it.each([false, true])(
  'declares template deletion preview versus permanent confirm (%s)',
  (confirmed) => {
    const argv = [
      'approval-template',
      'delete',
      'qa',
      ...(confirmed ? ['--confirm', '--delete-revision', 'a'.repeat(64)] : []),
    ];
    const expected = {
      changes: confirmed ? 'irreversible' : 'none',
      reach: 'local',
      personalData: true,
      ...(confirmed ? { authority: 'management' } : {}),
    };
    expect(cliEffects(argv)).toEqual(expected);
    expect(brokerCliEffects('deepseekbot approval-template', { patch: { argv } })).toEqual(
      expected,
    );
    expect(toolEffects('deepseekbot_cli', { argv })).toEqual(expected);
    if (confirmed)
      expect(toolApprovalRequired('deepseekbot approval-template', { patch: { argv } }, true)).toBe(
        true,
      );
  },
);

it.each([
  {
    argv: ['skills-memory', '--bot', 'ada'],
    expected: { changes: 'none', reach: 'memory', personalData: true },
  },
  {
    argv: ['skills-show', 'review', '--owner', 'host'],
    expected: { changes: 'none', reach: 'local', personalData: true },
  },
  {
    argv: ['skills-show', 'review', '--owner', 'bot:ada'],
    expected: { changes: 'none', reach: 'memory', personalData: true },
  },
  {
    argv: ['skills-show', 'review', '--owner', 'workspace:project'],
    expected: { changes: 'none', reach: 'workspace', personalData: true },
  },
  {
    argv: ['skills-remove', 'review', '--bot', 'ada', '--confirm'],
    expected: { changes: 'reversible', reach: 'memory', personalData: true },
  },
])('declares newly landed Skill commands on shared CLI paths: $argv', ({ argv, expected }) => {
  expect(cliEffects(argv)).toEqual(expected);
  expect(brokerCliEffects('deepseekbot ' + argv[0], { patch: { argv } })).toEqual(expected);
  expect(toolEffects('deepseekbot_cli', { argv })).toEqual(expected);
});
