import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCallMedia } from '../src/media/call-supervisor.js';

vi.mock('../src/media/install-macos.js', async (original) => ({
  ...(await original<typeof import('../src/media/install-macos.js')>()),
  verifyMacVideoHelper: async () => true,
}));
vi.mock('../src/media/install.js', async (original) => ({
  ...(await original<typeof import('../src/media/install.js')>()),
  verifyLocalVideoAssets: async () => undefined,
}));

const FAKE_LAUNCHER = String.raw`
const launchId = process.argv[5];
const emit = (value) => process.stdout.write(JSON.stringify({ ...value, launchId }) + '\n');
const helper = (message) => emit({ event: 'helper-message', json: JSON.stringify(message) });
emit({ event: 'tree-owned', version: 1, rootPid: process.pid });
helper({ event: 'ready', version: 1 });
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  let newline;
  while ((newline = input.indexOf('\n')) >= 0) {
    const request = JSON.parse(input.slice(0, newline));
    input = input.slice(newline + 1);
    const value =
      request.op === 'offer'
        ? { offer: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' } }
        : null;
    helper({ id: request.id, ok: true, value });
  }
});
process.stdin.on('end', () => {
  helper({ event: 'state', state: 'closed' });
  emit({ event: 'tree-closed', version: 1, activeProcesses: 0 });
  process.stdout.end(() => process.exit(0));
});
`;

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function media(events: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'call-media-test-'));
  roots.push(root);
  await writeFile(join(root, 'launcher-macos.cjs'), FAKE_LAUNCHER);
  return createCallMedia({
    platform: 'darwin',
    arch: 'arm64',
    helperDirectory: root,
    assetsDirectory: root,
    onEvent: (detail) => events.push(detail),
  });
}

const open = (calls: ReturnType<typeof createCallMedia>, callId: string) =>
  calls.open({
    callId,
    signal: new AbortController().signal,
    onPcm: () => undefined,
    onStatus: () => undefined,
  });

describe('call media supervisor', () => {
  it('accepts the cleanup receipt that arrives after hang-up, so the next call can start', async () => {
    const events: string[] = [];
    const calls = await media(events);
    const first = await open(calls, 'call-1');
    expect(first.offer?.type).toBe('offer');
    await first.close();
    expect(events.some((detail) => detail.includes('phase=call-media-tree-closed'))).toBe(true);
    expect(events.some((detail) => detail.includes('cleanup-refused'))).toBe(false);
    const second = await open(calls, 'call-2');
    expect(second.offer?.type).toBe('offer');
    await second.close();
  });
});
