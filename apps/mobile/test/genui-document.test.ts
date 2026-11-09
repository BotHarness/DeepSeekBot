import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';

import { syntheticGenuiDocument } from '../../../packages/core/test/fixtures/genui-document';
import { GENUI_EXECUTION_LIMITS } from '../../../packages/core/src/channels/genui-execution-limits';
import { genuiMobileRuntimeModule } from '../scripts/generate-genui-runtime.mjs';
import { createHostClient, type HostClient } from '../src/host/client';
import {
  createConversation,
  type CachedConversation,
  type Conversation,
  type ConversationSnapshot,
} from '../src/host/conversation';
import {
  genuiDocumentReply,
  GENUI_BRIDGE_BYTES,
  GENUI_FRAME_MAX_HEIGHT,
  genuiDocumentOf,
  genuiDocumentPage,
  genuiNavigationAllowed,
  genuiHeightKey,
  genuiTextScale,
  GENUI_REMEMBERED_HEIGHTS,
  parseGenuiBridgeMessage,
  rememberedGenuiHeight,
  rememberGenuiHeight,
} from '../src/genui/document';
import { GENUI_RUNTIME } from '../src/genui/runtime.generated';
import { genuiDocumentView } from '../src/genui/view';
import { FakeHost } from './fake-host';

const ROUTE = 'https://studio.tailnet-example.ts.net';
const SLUG = 'bot-59296301f8d044d2b022d8784c5ed3fe';
const DM = `dm-${SLUG}`;
const report = {
  version: 1,
  snapshotId: 'report-1',
  observedAt: '2026-11-08T00:00:00Z',
  title: 'Legacy report',
  columns: [{ id: 'name', label: 'Name', kind: 'text' }],
  rows: [],
  elements: [{ kind: 'table', columnIds: ['name'] }],
};

let client: HostClient | undefined;
let conversation: Conversation | undefined;
afterEach(() => {
  conversation?.stop();
  client?.stop();
  client = undefined;
});

function open(host: FakeHost): Conversation {
  const store = new Map<string, CachedConversation>();
  client ??= createHostClient({
    routes: [ROUTE],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  conversation = createConversation({
    host: client,
    botSlug: SLUG,
    channelId: DM,
    cacheKey: `computer:${host.hostId}:${SLUG}`,
    cache: {
      read: async (key: string) => structuredClone(store.get(key)),
      write: (key: string, value: CachedConversation) => store.set(key, structuredClone(value)),
    },
    pageSize: 10,
  });
  conversation.start();
  return conversation;
}

async function until(
  target: Conversation,
  accept: (snapshot: ConversationSnapshot) => boolean,
): Promise<ConversationSnapshot> {
  for (let tries = 0; tries < 400; tries += 1) {
    const snapshot = target.getSnapshot();
    if (accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out; last snapshot ${JSON.stringify(target.getSnapshot())}`);
}

describe('GenUI documents in the native conversation', () => {
  it('carries the canonical v2 document beside its readable summary and ignores other content', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'doc',
        body: 'Readable summary',
        author: { kind: 'bot', slug: SLUG },
        genui: syntheticGenuiDocument,
      },
      false,
    );
    channel.append(
      {
        id: 'legacy',
        body: 'Legacy summary',
        author: { kind: 'bot', slug: SLUG },
        genui: report as never,
      },
      false,
    );
    const live = open(host);
    const snapshot = await until(live, (s) => s.status === 'live' && s.messages.length >= 2);
    const doc = snapshot.messages.find((message) => message.id === 'doc');
    expect(doc?.body).toBe('Readable summary');
    expect(doc?.genuiDocument?.snapshotId).toBe(syntheticGenuiDocument.snapshotId);
    expect(doc?.genuiDocument?.html).toBe(syntheticGenuiDocument.html);
    const legacy = snapshot.messages.find((message) => message.id === 'legacy');
    expect(legacy?.body).toBe('Legacy summary');
    expect(legacy?.genuiDocument).toBeUndefined();
  });

  it('drops a purged document and revokes its retained private draft', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'doc',
        body: 'Readable summary',
        author: { kind: 'bot', slug: SLUG },
        genui: syntheticGenuiDocument,
      },
      false,
    );
    const live = open(host);
    await until(live, (s) => s.messages.some((message) => message.genuiDocument !== undefined));
    if (!client) throw new Error('Host client unavailable');
    const view = genuiDocumentView(syntheticGenuiDocument, DM, 'doc', client);
    const initial = view.getSnapshot().state;
    view.edit({ ...initial, values: { ...initial.values, filter: 'Private draft' } });
    live.stop();
    channel.purge('doc');
    const reopened = open(host);
    const purged = await until(
      reopened,
      (s) => s.messages.find((message) => message.id === 'doc')?.body === '',
    );
    expect(purged.messages.find((message) => message.id === 'doc')?.genuiDocument).toBeUndefined();
    expect(view.getSnapshot()).toMatchObject({ available: false, state: initial });
  });

  it('sends a continuation as an ordinary Human message carrying the typed document reply', async () => {
    const host = new FakeHost();
    const channel = host.channel(DM);
    channel.append(
      {
        id: 'doc',
        body: 'Readable summary',
        author: { kind: 'bot', slug: SLUG },
        genui: syntheticGenuiDocument,
      },
      false,
    );
    const live = open(host);
    await until(live, (s) => s.status === 'live' && s.messages.length === 1);
    const initial = genuiDocumentView(syntheticGenuiDocument, DM, 'doc').getSnapshot().state;
    const reply = genuiDocumentReply(syntheticGenuiDocument, 'doc', 'continue', {
      ...initial,
      values: { ...initial.values, selected: 'beta' },
    });
    const body = 'Continue with document “Synthetic project explorer” using my current view.';
    const id = live.send(body, [], { genuiReply: reply });
    const snapshot = await until(
      live,
      (s) => s.messages.find((message) => message.id === id)?.delivery === 'committed',
    );
    expect(snapshot.messages.find((message) => message.id === id)).toMatchObject({
      author: 'human',
      body,
    });
    const stored = channel.messages.find((message) => message.id === id);
    expect(stored?.genuiReply).toEqual(reply);
    expect(stored?.body).toBe(body);
  });

  it('builds a sorted, snapshot-bound reply and refuses invalid state', () => {
    const initial = genuiDocumentView(syntheticGenuiDocument, DM, 'doc').getSnapshot().state;
    const reply = genuiDocumentReply(syntheticGenuiDocument, 'doc', 'refresh', initial);
    expect(reply).toMatchObject({
      version: 2,
      messageId: 'doc',
      snapshotId: syntheticGenuiDocument.snapshotId,
      intent: 'refresh',
    });
    expect(Object.keys(reply.state.values)).toEqual(Object.keys(reply.state.values).sort());
    expect(() =>
      genuiDocumentReply(syntheticGenuiDocument, 'doc', 'continue', {
        ...initial,
        values: { ...initial.values, sort: 'sideways' },
      }),
    ).toThrow();
  });

  it('accepts only valid version-2 documents', () => {
    expect(genuiDocumentOf(syntheticGenuiDocument)?.title).toBe(syntheticGenuiDocument.title);
    for (const value of [
      undefined,
      null,
      'html',
      report,
      { ...syntheticGenuiDocument, html: '' },
      { ...syntheticGenuiDocument, extra: true },
    ])
      expect(genuiDocumentOf(value)).toBeUndefined();
  });
});

describe('GenUI native WebView bridge', () => {
  const message = (value: Record<string, unknown>) =>
    JSON.stringify({ instanceId: 'genui-mobile-1', ...value });

  it('accepts only bounded readiness, height and failure messages for the current mount', () => {
    expect(parseGenuiBridgeMessage(message({ type: 'ready' }), 'genui-mobile-1')).toEqual({
      type: 'ready',
    });
    expect(
      parseGenuiBridgeMessage(message({ type: 'height', height: 320.2 }), 'genui-mobile-1'),
    ).toEqual({ type: 'height', height: 321 });
    expect(
      parseGenuiBridgeMessage(message({ type: 'failure', reason: 'execution' }), 'genui-mobile-1'),
    ).toEqual({ type: 'failure', reason: 'execution' });
  });

  it('refuses stale, oversized, malformed, extended or out-of-range messages', () => {
    for (const data of [
      message({ type: 'ready' }).replace('genui-mobile-1', 'genui-mobile-2'),
      message({ type: 'ready', extra: 1 }),
      message({ type: 'height', height: 0 }),
      message({ type: 'height', height: -5 }),
      message({ type: 'height', height: GENUI_FRAME_MAX_HEIGHT + 1 }),
      message({ type: 'height', height: '100' }),
      message({ type: 'failure', reason: 'navigate' }),
      message({ type: 'navigate', url: 'https://example.com' }),
      JSON.stringify([{ type: 'ready', instanceId: 'genui-mobile-1' }]),
      'not json',
      '',
      message({ type: 'ready', pad: 'x'.repeat(GENUI_BRIDGE_BYTES) }),
      undefined,
    ])
      expect(parseGenuiBridgeMessage(data, 'genui-mobile-1')).toBeUndefined();
  });

  it('allows only the initial document and its script-disabled mirror frame', () => {
    expect(genuiNavigationAllowed('about:blank')).toBe(true);
    expect(genuiNavigationAllowed('about:srcdoc')).toBe(true);
    for (const url of [
      'https://example.com',
      'http://127.0.0.1:52401/',
      'file:///etc/hosts',
      'data:text/html,hi',
      'javascript:alert(1)',
      'about:blank#x',
    ])
      expect(genuiNavigationAllowed(url)).toBe(false);
  });

  it('follows native font scale inside the mirror bounds', () => {
    expect(genuiTextScale(1)).toBe(1);
    expect(genuiTextScale(22 / 14)).toBe(22 / 14);
    expect(genuiTextScale(100)).toBe(GENUI_EXECUTION_LIMITS.mirrorMaxTextScale);
    expect(genuiTextScale(0.1)).toBe(GENUI_EXECUTION_LIMITS.mirrorMinTextScale);
    expect(genuiTextScale(Number.NaN)).toBe(1);
  });

  it('builds the native page with the packaged runtime and no network allowance', () => {
    const html = genuiDocumentPage(syntheticGenuiDocument, {
      instanceId: 'genui-mobile-1',
      theme: 'dark',
      fontScale: 1.4,
      runtimeBase64: GENUI_RUNTIME.base64,
    });
    expect(html).toContain('window.ReactNativeWebView');
    expect(html).toContain("connect-src 'none'");
    expect(html).toContain('"theme":"dark"');
    expect(html).toContain('"textScale":1.4');
    expect(html).toContain(GENUI_RUNTIME.base64.slice(0, 64));
    expect(html).toContain('content="width=device-width,');
  });

  it('scales the whole page instead of the mirror when page zoom is requested', () => {
    const html = genuiDocumentPage(syntheticGenuiDocument, {
      instanceId: 'genui-mobile-2',
      theme: 'light',
      fontScale: 1.4,
      pageZoom: true,
      runtimeBase64: GENUI_RUNTIME.base64,
    });
    expect(html).not.toContain('"textScale"');
    expect(html).toContain(
      '<meta name="viewport" content="initial-scale=1.4,minimum-scale=1.4,maximum-scale=1.4,user-scalable=no">',
    );
    expect(html).not.toContain('width=device-width');
  });
});

describe('GenUI packaged mobile runtime', () => {
  it('matches the current shared preview runtime build byte for byte', async () => {
    const decoded = Buffer.from(GENUI_RUNTIME.base64, 'base64');
    expect(decoded.byteLength).toBe(GENUI_RUNTIME.bytes);
    expect(createHash('sha256').update(decoded).digest('hex')).toBe(GENUI_RUNTIME.sha256);
    const { readFile } = await import('node:fs/promises');
    const committed = await readFile(
      new URL('../src/genui/runtime.generated.ts', import.meta.url),
      'utf8',
    );
    expect(committed, 'Run pnpm --filter @botharness/mobile generate:genui-runtime').toBe(
      await genuiMobileRuntimeModule(),
    );
  }, 60_000);
});

describe('remembered GenUI frame height', () => {
  it('keeps the last measured height per message and text scale, bounded', () => {
    const key = genuiHeightKey('m-height', syntheticGenuiDocument, 1);
    expect(rememberedGenuiHeight(key)).toBeUndefined();
    rememberGenuiHeight(key, 320);
    rememberGenuiHeight(key, 410);
    expect(rememberedGenuiHeight(key)).toBe(410);
    expect(genuiHeightKey('m-height', syntheticGenuiDocument, 1.4)).not.toBe(key);
    rememberGenuiHeight(key, Number.NaN);
    rememberGenuiHeight(key, GENUI_EXECUTION_LIMITS.mirrorMinHeight - 1);
    expect(rememberedGenuiHeight(key)).toBe(410);
    for (let index = 0; index < GENUI_REMEMBERED_HEIGHTS; index++)
      rememberGenuiHeight(genuiHeightKey(`m-${index}`, syntheticGenuiDocument, 1), 100);
    expect(rememberedGenuiHeight(key)).toBeUndefined();
    expect(
      rememberedGenuiHeight(
        genuiHeightKey(`m-${GENUI_REMEMBERED_HEIGHTS - 1}`, syntheticGenuiDocument, 1),
      ),
    ).toBe(100);
  });
});
