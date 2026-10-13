import { describe, expect, it } from 'vitest';

import type { ChannelMessage, ChannelRecord } from '../src/channels/channel.js';
import { queryChannelMessages } from '../src/channels/store.js';
import { readZip } from '../src/bots/zip-archive.js';
import {
  collectDiagnosticBundle,
  DiagnosticBundleError,
  sliceSessionEvents,
  type DiagnosticBundleSource,
} from '../src/diagnostics/bundle.js';
import {
  createDiagnosticBundleHttp,
  DIAGNOSTIC_BUNDLE_PATH,
  DIAGNOSTIC_BUNDLE_PREVIEW_PATH,
} from '../src/diagnostics/bundle-http.js';
import { createDiagnosticRedactor } from '../src/diagnostics/redaction.js';
import type { InboxHistoryItem } from '../src/runtime/inbox-history.js';
import type { SessionOwnershipRecord } from '../src/sessions/ownership.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

const T = Date.parse('2026-10-13T04:00:00.000Z');
const at = (minutes: number) => new Date(T + minutes * 60_000).toISOString();
const ms = (minutes: number) => T + minutes * 60_000;
const homes = [
  { path: '/Users/alice/.deepseek-harness', label: '$DSH_HOME' },
  { path: '/Users/alice', label: '~' },
];

function message(id: string, minutes: number, extra: Partial<ChannelMessage>): ChannelMessage {
  return { id, at: at(minutes), author: { kind: 'human' }, body: '', ...extra };
}

function fixture() {
  const channels: ChannelRecord[] = [
    {
      id: 'group-1',
      type: 'group',
      name: '产品讨论',
      members: ['mira', 'kai'],
      createdAt: at(-600),
      updatedAt: at(0),
    },
    {
      id: 'dm-mira',
      type: 'dm',
      name: 'Mira',
      members: ['mira'],
      botSlug: 'mira',
      createdAt: at(-600),
      updatedAt: at(0),
    },
    {
      id: 'dm-kai',
      type: 'dm',
      name: 'Kai',
      members: ['kai'],
      botSlug: 'kai',
      createdAt: at(-600),
      updatedAt: at(0),
    },
    {
      id: 'other',
      type: 'group',
      name: 'Unrelated',
      members: ['mira'],
      createdAt: at(-600),
      updatedAt: at(0),
    },
  ];
  const messages: Record<string, ChannelMessage[]> = {
    'group-1': [
      message('g-old', -120, { body: 'long before the range' }),
      message('g-before', -38, { body: 'context while Mira was already working' }),
      message('g-ask', 0, {
        body: '@Mira why is the build failing?',
        mentions: [{ botSlug: 'mira', label: 'Mira', start: 0, end: 5 }],
        deliveries: [{ botSlug: 'mira', state: 'handled' }],
      }),
      message('g-later', 50, { body: 'outside the padding' }),
    ],
    'dm-mira': [
      message('dm-reply', 1, {
        author: { kind: 'bot', slug: 'mira' },
        body: 'The build fails in /Users/alice/work/app/src/main.ts',
      }),
    ],
    'dm-kai': [message('kai-dm', 1, { body: 'Kai was never involved' })],
    other: [message('other-1', 1, { body: 'private unrelated chat' })],
  };
  const orchestrator: SessionOwnershipRecord = {
    sessionId: 'session-mira',
    botSlug: 'mira',
    rootRole: 'orchestrator',
    provenance: 'created',
    parentSessionId: undefined,
    cwdReference: undefined,
    createdAt: at(-600),
  };
  const events: Record<string, DshSessionEvent[]> = {
    'session-mira': [
      { type: 'turn/start', seq: 1, time: ms(-200), data: {} },
      { type: 'turn/end', seq: 2, time: ms(-199), data: {} },
      { type: 'turn/start', seq: 3, time: ms(-40), data: {} },
      {
        type: 'request/header',
        seq: 4,
        time: ms(-40),
        data: {
          header: {
            config: { provider: 'deepseek', model: 'deepseek-chat' },
            headers: { authorization: 'Bearer sk-abcdefghijklmnopqrstuvwxyz' },
          },
        },
      },
      {
        type: 'tool/call',
        seq: 5,
        time: ms(1),
        data: {
          name: 'channel_send',
          callId: 'call-1',
          arguments: JSON.stringify({
            channel_id: 'dm-mira',
            text: 'see /Users/alice/work/app/src/main.ts and ~/notes.md',
            api_key: 'sk-live-0123456789abcdefghij',
          }),
        },
      },
      { type: 'tool/result', seq: 6, time: ms(1), data: { callId: 'call-1' } },
      { type: 'turn/end', seq: 7, time: ms(2), data: {} },
      { type: 'turn/start', seq: 8, time: ms(90), data: {} },
    ],
  };
  const admissions: Record<string, InboxHistoryItem[]> = {
    mira: [
      {
        sourceEventId: 'se-ask',
        at: at(0),
        kind: 'group-mention',
        sourceKind: 'human-message',
        state: 'handled',
        channelId: 'group-1',
        snippet: '@Mira why is the build failing?',
      },
      {
        sourceEventId: 'se-other',
        at: at(1),
        kind: 'group-mention',
        sourceKind: 'human-message',
        state: 'handled',
        channelId: 'other',
        snippet: 'private unrelated chat',
      },
    ],
  };
  const reads: string[] = [];
  const source: DiagnosticBundleSource = {
    channels: {
      get: (id) => channels.find((channel) => channel.id === id),
      list: () => channels,
      message: (id, messageId) => messages[id]?.find((entry) => entry.id === messageId),
      queryMessages: (id, options) => queryChannelMessages(id, messages[id] ?? [], options),
    },
    inboxHistory: {
      list: (slug, input = {}) => ({
        items: (admissions[slug] ?? []).filter(
          (item) =>
            (input.since === undefined || item.at >= input.since) &&
            (input.until === undefined || item.at <= input.until),
        ),
      }),
    },
    ownership: {
      rootsFor: (slug, role) => (slug === 'mira' && role === 'orchestrator' ? [orchestrator] : []),
      descendantsOf: () => [],
    },
    botName: (slug) => ({ mira: 'Mira', kai: 'Kai' })[slug],
    readSession: async (id) => {
      reads.push(id);
      return events[id];
    },
    environment: { version: '1.2.3', platform: 'darwin', arch: 'arm64', node: 'v24.21.0' },
    now: () => ms(10),
  };
  return { source, reads };
}

function files(entries: Array<{ path: string; data: Buffer }>) {
  return Object.fromEntries(entries.map((entry) => [entry.path, entry.data.toString('utf8')]));
}

describe('Diagnostic Bundle', () => {
  it('exports the selected range, the involved Bot DM and its in-flight Orchestrator turn', async () => {
    const { source } = fixture();
    const bundle = await collectDiagnosticBundle(
      source,
      { channelId: 'group-1', fromMessageId: 'g-ask' },
      createDiagnosticRedactor({ homes }),
    );
    expect(bundle.summary.range).toEqual({
      requestedStart: at(-30),
      requestedEnd: at(10),
      start: at(-40),
      end: at(10),
    });
    expect(bundle.summary.bots).toEqual([{ slug: 'mira', displayName: 'Mira' }]);
    expect(bundle.summary.channels.map((channel) => [channel.id, channel.messages])).toEqual([
      ['group-1', 2],
      ['dm-mira', 1],
    ]);
    expect(bundle.summary.sessions).toEqual([
      expect.objectContaining({ id: 'session-mira', events: 5, extendedForInFlightTurn: true }),
    ]);

    const output = files(bundle.entries);
    expect(Object.keys(output).sort()).toEqual([
      'README.md',
      'admissions.jsonl',
      'channels/dm-mira.jsonl',
      'channels/group-1.jsonl',
      'manifest.json',
      'redaction-report.json',
      'sessions/session-mira.jsonl',
      'timeline.jsonl',
    ]);
    const all = Object.values(output).join('\n');
    expect(all).not.toContain('/Users/alice');
    expect(all).not.toContain('sk-');
    expect(all).not.toContain('private unrelated chat');
    expect(all).not.toContain('Kai was never involved');
    expect(all).not.toContain('long before the range');
    expect(output['channels/group-1.jsonl']).toContain('context while Mira was already working');
    expect(output['sessions/session-mira.jsonl']).toContain('main.ts');
    expect(output['sessions/session-mira.jsonl']).toContain('deepseek-chat');
    expect(output['sessions/session-mira.jsonl']).toContain('~/notes.md');

    const timeline = output['timeline.jsonl']!.trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(
      timeline.map((entry) => [entry.source, entry.kind, entry.channelId ?? entry.tool]),
    ).toEqual([
      ['session', 'turn/start', undefined],
      ['channel', 'message', 'group-1'],
      ['channel', 'message', 'group-1'],
      ['admission', 'group-mention', 'group-1'],
      ['channel', 'message', 'dm-mira'],
      ['session', 'tool/call', 'channel_send'],
      ['session', 'tool/result', undefined],
      ['session', 'turn/end', undefined],
    ]);
    const report = JSON.parse(output['redaction-report.json']!);
    expect(report.hits['home-path']).toBeGreaterThan(0);
    expect(report.hits['secret-field']).toBeGreaterThan(0);
    expect(report.hits['request-headers']).toBe(1);
  });

  it('rejects messages outside the selected Channel', async () => {
    const { source } = fixture();
    await expect(
      collectDiagnosticBundle(
        source,
        { channelId: 'group-1', fromMessageId: 'other-1' },
        createDiagnosticRedactor({ homes }),
      ),
    ).rejects.toThrow(DiagnosticBundleError);
  });

  it('marks every selected message and rejects selections from other Channels', async () => {
    const { source } = fixture();
    const bundle = await collectDiagnosticBundle(
      source,
      {
        channelId: 'group-1',
        fromMessageId: 'g-before',
        toMessageId: 'g-ask',
        messageIds: ['g-before', 'g-ask'],
      },
      createDiagnosticRedactor({ homes }),
    );
    const output = files(bundle.entries);
    expect(JSON.parse(output['manifest.json']!).selection.messageIds).toEqual([
      'g-before',
      'g-ask',
    ]);
    const selected = output['timeline.jsonl']!.trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.selected === true)
      .map((entry) => entry.messageId);
    expect(selected).toEqual(['g-before', 'g-ask']);
    await expect(
      collectDiagnosticBundle(
        source,
        { channelId: 'group-1', fromMessageId: 'g-ask', messageIds: ['g-ask', 'other-1'] },
        createDiagnosticRedactor({ homes }),
      ),
    ).rejects.toThrow(DiagnosticBundleError);
  });

  it('downloads exactly the previewed bundle once', async () => {
    const { source, reads } = fixture();
    const http = createDiagnosticBundleHttp({ source, homes, now: () => ms(10) });
    const post = (path: string, body: unknown) =>
      http(
        new Request('http://host' + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    const preview = await post(DIAGNOSTIC_BUNDLE_PREVIEW_PATH, {
      channelId: 'group-1',
      fromMessageId: 'g-ask',
    });
    const summary = await preview.json();
    expect(preview.status).toBe(200);
    expect(summary.sessions).toHaveLength(1);
    const download = await post(DIAGNOSTIC_BUNDLE_PATH, { token: summary.token });
    expect(download.headers.get('content-type')).toBe('application/zip');
    const entries = readZip(Buffer.from(await download.arrayBuffer()), {
      maxEntries: 100,
      maxTotalBytes: 1 << 26,
    });
    expect(entries.map((entry) => entry.path)).toContain('timeline.jsonl');
    expect(reads).toEqual(['session-mira']);
    const again = await post(DIAGNOSTIC_BUNDLE_PATH, { token: summary.token });
    expect((await again.json()).error.code).toBe('preview-stale');
  });
});

describe('sliceSessionEvents', () => {
  const event = (type: string, minutes: number): DshSessionEvent => ({
    type,
    time: ms(minutes),
    data: {},
  });
  it('keeps a turn running at the range end until it ends', () => {
    const slice = sliceSessionEvents(
      [
        event('turn/start', 5),
        event('tool/call', 9),
        event('tool/call', 12),
        event('turn/end', 15),
      ],
      ms(0),
      ms(10),
    );
    expect(slice.events.map((entry) => entry.type)).toEqual([
      'turn/start',
      'tool/call',
      'tool/call',
      'turn/end',
    ]);
  });
  it('does not reach back further than the in-flight bound', () => {
    const slice = sliceSessionEvents(
      [event('turn/start', -24 * 60), event('tool/call', 1)],
      ms(0),
      ms(10),
    );
    expect(slice).toEqual({ events: [event('tool/call', 1)], extendedForInFlightTurn: false });
  });
});

describe('Diagnostic redaction', () => {
  const redactor = () => createDiagnosticRedactor({ homes, key: Buffer.alloc(32, 7) });
  it('keeps URLs and relative paths while hiding absolute folders consistently', () => {
    const value = redactor();
    const first = value.text('open /opt/work/repo/a.ts then https://example.com/x/y and ./b/c.ts');
    expect(first).toMatch(
      /^open <path:[0-9a-f]{6}>\/a\.ts then https:\/\/example\.com\/x\/y and \.\/b\/c\.ts$/u,
    );
    expect(value.text('/opt/work/repo/z.ts').split('/')[0]).toBe(
      first.split(' ')[1]!.split('/')[0],
    );
  });
  it('maps homes, Windows paths, secrets and emails', () => {
    const value = redactor();
    expect(value.text('/Users/alice/.deepseek-harness/sessions/x')).toBe('$DSH_HOME/sessions/x');
    expect(value.text('C:\\Users\\alice\\repo\\main.ts')).toMatch(
      /^<path:[0-9a-f]{6}>\\main\.ts$/u,
    );
    expect(value.text('token ghp_abcdefghijklmnopqrstuvwxyz0123')).toBe('token <secret>');
    expect(value.text('https://x.dev/cb?code=abc&state=1')).toBe(
      'https://x.dev/cb?code=<secret>&state=1',
    );
    expect(value.text('mail me@example.com')).toMatch(/^mail <email:[0-9a-f]{6}>$/u);
    expect(
      value.value({ password: 'hunter2', inputTokens: 12, nested: { Authorization: 'x' } }),
    ).toEqual({
      password: '<secret>',
      inputTokens: 12,
      nested: { Authorization: '<secret>' },
    });
  });
});

describe('Diagnostic redaction boundaries', () => {
  it('stops a path at CJK punctuation so surrounding text stays readable', () => {
    const value = createDiagnosticRedactor({ homes, key: Buffer.alloc(32, 7) });
    expect(value.text('项目在 /home/bob/app/bundle.ts，请回答')).toMatch(
      /^项目在 <path:[0-9a-f]{6}>\/bundle\.ts，请回答$/u,
    );
    expect(value.text('see `/srv/app/x.ts`.')).toMatch(/^see `<path:[0-9a-f]{6}>\/x\.ts`\.$/u);
  });
});
