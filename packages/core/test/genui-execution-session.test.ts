import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createGenuiExecutionSession,
  type GenuiExecutionSession,
} from '../src/channels/genui-execution-session.js';
import {
  GENUI_EXECUTION_PROTOCOL,
  parseGenuiExecutionReply,
  type GenuiExecutionReply,
} from '../src/channels/genui-execution.js';
import { initialGenuiDocumentState } from '../src/channels/genui-document.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';
import { buildGenuiGuestLibrary } from '../../../scripts/genui-runtime-assets.mjs';

const require = createRequire(import.meta.url);
const wasmBinary = new Uint8Array(
  await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')),
).buffer;
const library = await buildGenuiGuestLibrary();
const librarySource = library.text;
const sessions: GenuiExecutionSession[] = [];
const header = { protocol: GENUI_EXECUTION_PROTOCOL, instanceId: 'session-test', generation: 2 };

async function open(html = syntheticGenuiDocument.html) {
  const document = { ...syntheticGenuiDocument, html };
  const replies: GenuiExecutionReply[] = [];
  let stops = 0;
  const session = await createGenuiExecutionSession({
    ...header,
    document,
    state: initialGenuiDocumentState(document),
    theme: 'light',
    librarySource,
    wasmBinary,
    send: (reply) => replies.push(reply),
    stopped: () => {
      stops++;
    },
  });
  sessions.push(session);
  return { session, replies, document, stops: () => stops };
}

afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
});

describe('GenUI generation-scoped execution session', () => {
  it('publishes canonical sequenced snapshots and rejects same-mount replay', async () => {
    const { session, replies, document, stops } = await open();
    const first = replies[0];
    expect(first?.type).toBe('snapshot');
    expect(parseGenuiExecutionReply(first, { ...header, lastSequence: 0 }, document)).toEqual(
      first,
    );
    const command = { ...header, sequence: 1, type: 'theme', theme: 'dark' };
    session.receive(command);
    expect(replies[1]).toMatchObject({
      type: 'snapshot',
      sequence: 2,
      html: expect.stringContaining('color-scheme:dark'),
    });
    session.receive(command);
    expect(replies[2]).toMatchObject({ type: 'error', sequence: 3, reason: 'invalid-content' });
    expect(session.isStopped).toBe(true);
    expect(stops()).toBe(1);
    session.dispose();
    expect(stops()).toBe(1);
  });

  it('refuses stale mounts, sequence gaps, oversized commands and invalid state', async () => {
    for (const patch of [
      { generation: 1 },
      { instanceId: 'old' },
      { sequence: 2 },
      { extra: true },
    ]) {
      const { session, replies } = await open();
      session.receive({ ...header, sequence: 1, type: 'theme', theme: 'light', ...patch });
      expect(session.isStopped).toBe(true);
      expect(replies.at(-1)).toMatchObject({ type: 'error', reason: 'invalid-content' });
    }
    const { session, replies } = await open();
    session.receive({
      ...header,
      sequence: 1,
      type: 'restore',
      state: { version: 1, values: { injected: true } },
    });
    expect(replies.at(-1)).toMatchObject({ type: 'error', reason: 'invalid-content' });
  });

  it('services local timer mutations without a continuous DOM polling loop', async () => {
    const { session, replies } = await open(
      '<p id="result"></p><script>setTimeout(()=>document.querySelector("#result").textContent="timer result",50)</script>',
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(replies).toHaveLength(2);
    expect(replies[1]).toMatchObject({
      type: 'snapshot',
      sequence: 2,
      html: expect.stringContaining('timer result'),
    });
    session.dispose();
    const count = replies.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(replies).toHaveLength(count);
  });

  it('stops asynchronous runaway scripts and emits one bounded failure', async () => {
    const { session, replies, stops } = await open(
      '<script>setTimeout(()=>{for(;;){}},34)</script>',
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(replies.at(-1)).toMatchObject({ type: 'error', reason: 'execution' });
    expect(session.isStopped).toBe(true);
    expect(stops()).toBe(1);
    expect(replies.filter((reply) => reply.type === 'error')).toHaveLength(1);
    session.receive({ ...header, sequence: 1, type: 'theme', theme: 'dark' });
    expect(replies.filter((reply) => reply.type === 'error')).toHaveLength(1);
  });

  it('keeps failure sequences contiguous when the snapshot rate is exhausted', async () => {
    const { session, replies, document } = await open('<p>Bounded burst</p>');
    for (let sequence = 1; sequence <= 32; sequence++)
      session.receive({ ...header, sequence, type: 'theme', theme: 'dark' });
    expect(session.isStopped).toBe(true);
    expect(replies.at(-1)).toMatchObject({ type: 'error', reason: 'resource' });
    for (let index = 0; index < replies.length; index++) {
      expect(
        parseGenuiExecutionReply(replies[index], { ...header, lastSequence: index }, document),
      ).toEqual(replies[index]);
    }
  });
});
