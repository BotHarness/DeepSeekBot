import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { writeZip } from '../src/bots/zip-archive.js';
import { createTempRoot } from './helpers.js';

it('uploads through bounded authenticated CLI calls, recovers a lost chunk response and imports one Bot', async () => {
  const home = createTempRoot();
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected model execution');
      },
    },
  });
  const bridge = createBridgeMethods(core);
  let dropped = false;
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(302, { 'set-cookie': 'authority=signed', location: '/' }).end();
      return;
    }
    expect(request.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    expect(body.length).toBeLessThan(360_000);
    const { method, payload } = JSON.parse(body.toString());
    let result;
    switch (method) {
      case 'botharness/zipUploadBegin':
        result = bridge.zipUploadBegin(payload.args);
        break;
      case 'botharness/zipUploadChunk':
        result = bridge.zipUploadChunk(payload.args);
        break;
      case 'botharness/zipUploadPreview':
        result = bridge.zipUploadPreview(payload.args);
        break;
      case 'botharness/zipImportLookup':
        result = bridge.zipImportLookup(payload.args);
        break;
      case 'botharness/zipImport':
        result = await bridge.zipImport(payload.args);
        break;
      default:
        throw new Error('Unexpected RPC');
    }
    if (method === 'botharness/zipUploadChunk' && !dropped) {
      dropped = true;
      response.destroy();
      return;
    }
    response.end(JSON.stringify({ type: 'server-response', result }));
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test address');
    const invoke = async (argv: string[]) => {
      const out: string[] = [];
      const err: string[] = [];
      const code = await runBotCreateCli(argv, {
        env: {
          DEEPSEEKBOT_HOST: `http://127.0.0.1:${address.port}`,
          DEEPSEEKBOT_HOST_TOKEN: 'private-zip-test-token',
        },
        stdout: (line) => out.push(line),
        stderr: (line) => err.push(line),
      });
      expect(out).toHaveLength(1);
      expect(out.join('') + err.join('')).not.toContain('private-zip-test-token');
      return { code, value: JSON.parse(out[0]!) };
    };
    const file = join(home, 'source.zip');
    writeFileSync(file, writeZip([{ path: 'notes.bin', data: randomBytes(300_000) }]));
    const upload = ['bot-zip-upload', '--upload-key', 'cli-upload-001', '--from-zip', file];
    expect((await invoke(upload)).value.error.code).toBe('host-unreachable');
    const uploaded = await invoke(upload);
    expect(uploaded.code).toBe(0);
    expect(uploaded.value.offset).toBe(uploaded.value.sizeBytes);
    const source = [
      '--upload-key',
      'cli-upload-001',
      '--archive-sha256',
      uploaded.value.sha256,
      '--archive-size',
      String(uploaded.value.sizeBytes),
    ];
    const preview = await invoke(['bot-zip-preview', ...source]);
    expect(preview).toMatchObject({
      code: 0,
      value: { fileCount: 1, descriptor: { displayName: 'Bot' } },
    });
    const metadata = ['--operation-key', 'cli-import-001', '--name', 'CLI Zip Bot'];
    const absent = await invoke([
      'bot-zip-import-status',
      '--archive-sha256',
      uploaded.value.sha256,
      ...metadata,
    ]);
    expect(absent.value.receipt).toBeNull();
    const created = await invoke(['bot-zip-import', ...source, ...metadata]);
    expect(created).toMatchObject({
      code: 0,
      value: { receipt: { status: 'created' }, bot: { displayName: 'CLI Zip Bot' } },
    });
    expect(
      (
        await invoke([
          'bot-zip-import-status',
          '--archive-sha256',
          uploaded.value.sha256,
          ...metadata,
        ])
      ).value.receipt,
    ).toEqual(created.value.receipt);
    expect((await invoke(['bot-zip-import', ...source, ...metadata])).value.receipt).toEqual(
      created.value.receipt,
    );
    expect(core.registry.list()).toHaveLength(1);
    expect(core.channels.list()).toHaveLength(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
