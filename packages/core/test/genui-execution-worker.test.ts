import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import {
  GENUI_EXECUTION_PROTOCOL,
  parseGenuiExecutionReply,
  type GenuiExecutionReply,
} from '../src/channels/genui-execution.js';
import { initialGenuiDocumentState } from '../src/channels/genui-document.js';
import { syntheticGenuiDocument } from './fixtures/genui-document.js';
import {
  GenuiExecutionSupervisor,
  type GenuiExecutionPort,
  type GenuiExecutionSnapshot,
} from '../src/channels/genui-execution-supervisor.js';
import { buildGenuiGuestLibrary } from '../../../scripts/genui-runtime-assets.mjs';

const require = createRequire(import.meta.url);
const wasm = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'));
const library = await buildGenuiGuestLibrary();
const bundle = await build({
  entryPoints: [
    fileURLToPath(new URL('../src/channels/genui-execution-worker.ts', import.meta.url)),
  ],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  minify: true,
  define: {
    __GENUI_GUEST_LIBRARY__: JSON.stringify(library.text),
    __GENUI_WASM_BASE64__: JSON.stringify(wasm.toString('base64')),
  },
});
const directory = await mkdtemp(join(tmpdir(), 'botharness-genui-worker-test-'));
const workerPath = join(directory, 'worker.mjs');
await writeFile(workerPath, bundle.outputFiles[0]?.text ?? '');
const entryPath = join(directory, 'entry.mjs');
await writeFile(
  entryPath,
  `import {parentPort} from 'node:worker_threads';
globalThis.addEventListener=(type,callback)=>parentPort.on(type,(data)=>callback({data}));
globalThis.postMessage=(value)=>parentPort.postMessage(value);
globalThis.close=()=>parentPort.close();
await import(${JSON.stringify(pathToFileURL(workerPath).href)});`,
);
const workers: Worker[] = [];
const header = { protocol: GENUI_EXECUTION_PROTOCOL, instanceId: 'worker-test', generation: 1 };

afterEach(async () => {
  for (const worker of workers.splice(0)) await worker.terminate();
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

function send(worker: Worker, command: unknown, portId = 1): void {
  worker.postMessage({ portId, command });
}

function open(html = syntheticGenuiDocument.html, sharedWorker?: Worker, portId = 1) {
  const worker = sharedWorker ?? new Worker(entryPath);
  if (!sharedWorker) workers.push(worker);
  const document = { ...syntheticGenuiDocument, html };
  let sequence = 0;
  const replies: GenuiExecutionReply[] = [];
  const failures: unknown[] = [];
  const pending: {
    resolve: (reply: GenuiExecutionReply) => void;
    reject: (error: unknown) => void;
  }[] = [];
  worker.on('message', (value: unknown) => {
    if (
      !value ||
      typeof value !== 'object' ||
      !('portId' in value) ||
      value.portId !== portId ||
      !('reply' in value)
    )
      return;
    const reply = parseGenuiExecutionReply(
      value.reply,
      { ...header, lastSequence: sequence },
      document,
    );
    if (!reply) {
      failures.push(value);
      pending.shift()?.reject(Error('Invalid Worker reply.'));
      return;
    }
    sequence = reply.sequence;
    const waiter = pending.shift();
    if (waiter) waiter.resolve(reply);
    else replies.push(reply);
  });
  worker.on('error', (error) => {
    failures.push(error);
    for (const waiter of pending.splice(0)) waiter.reject(error);
  });
  const next = () => {
    const existing = replies.shift();
    if (existing) return Promise.resolve(existing);
    return new Promise<GenuiExecutionReply>((resolve, reject) => pending.push({ resolve, reject }));
  };
  send(
    worker,
    {
      ...header,
      type: 'boot',
      document,
      state: initialGenuiDocumentState(document),
      theme: 'light',
    },
    portId,
  );
  return { worker, document, next, failures };
}

describe('GenUI actual independently owned Worker entry', () => {
  it('boots concurrent reports in one Worker without crossing private state or disposal', async () => {
    const first = open();
    const second = open(syntheticGenuiDocument.html, first.worker, 2);
    const third = open(syntheticGenuiDocument.html, first.worker, 3);
    const fourth = open(syntheticGenuiDocument.html, first.worker, 4);
    expect((await first.next()).type).toBe('snapshot');
    expect((await second.next()).type).toBe('snapshot');
    expect((await third.next()).type).toBe('snapshot');
    expect((await fourth.next()).type).toBe('snapshot');
    send(first.worker, {
      ...header,
      type: 'restore',
      sequence: 1,
      state: {
        version: 1,
        values: { ...initialGenuiDocumentState(first.document).values, filter: 'Gamma' },
      },
    });
    expect(await first.next()).toMatchObject({
      type: 'snapshot',
      state: { values: { filter: 'Gamma' } },
    });
    send(second.worker, { ...header, sequence: 1, type: 'theme', theme: 'dark' }, 2);
    expect(await second.next()).toMatchObject({
      type: 'snapshot',
      state: { values: { filter: '' } },
    });
    first.worker.postMessage({ portId: 1, dispose: true });
    send(second.worker, { ...header, sequence: 2, type: 'theme', theme: 'light' }, 2);
    expect(await second.next()).toMatchObject({ type: 'snapshot', commandSequence: 2 });
    const replacement = open(syntheticGenuiDocument.html, first.worker, 5);
    expect((await replacement.next()).type).toBe('snapshot');
    expect(first.failures).toEqual([]);
    expect(second.failures).toEqual([]);
    expect(replacement.failures).toEqual([]);
  });

  it('keeps the offline guest library and complete Worker within separate source budgets', () => {
    expect(library.contents.byteLength).toBeLessThanOrEqual(393_216);
    expect(bundle.outputFiles[0]?.contents.byteLength).toBeLessThanOrEqual(1_572_864);
  });

  it('boots the real VM/DOM bundle and fences same-mount replay', async () => {
    const { worker, next, failures } = open();
    expect((await next()).type).toBe('snapshot');
    const command = { ...header, sequence: 1, type: 'theme', theme: 'dark' };
    send(worker, command);
    expect(await next()).toMatchObject({ type: 'snapshot', sequence: 2 });
    send(worker, command);
    expect(await next()).toMatchObject({ type: 'error', sequence: 3, reason: 'invalid-content' });
    expect(failures).toEqual([]);
  });

  it('bounds an actual runaway Worker guest while parent JavaScript remains responsive', async () => {
    const started = performance.now();
    const { next, failures } = open('<script>for(;;){}</script>');
    let parentAdvanced = false;
    setTimeout(() => {
      parentAdvanced = true;
    }, 20);
    const failure = await next();
    expect(failure).toMatchObject({ type: 'error', reason: 'execution' });
    expect(parentAdvanced).toBe(true);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(failures).toEqual([]);
  });

  it('bounds accumulating memory even while the guest keeps producing snapshots and heartbeats', async () => {
    const { next, failures } = open(
      '<p>Bounded allocation fixture</p><script>globalThis.retained=[];setInterval(()=>retained.push(new ArrayBuffer(524288)),50)</script>',
    );
    let heartbeats = 0;
    let failure: GenuiExecutionReply | undefined;
    for (let index = 0; index < 300; index++) {
      const reply = await next();
      expect(reply.wasmBytes).toBeLessThanOrEqual(64 * 1024 * 1024);
      if (reply.type === 'heartbeat') heartbeats++;
      if (reply.type === 'error') {
        failure = reply;
        break;
      }
    }
    expect(heartbeats).toBeGreaterThan(0);
    expect(failure).toMatchObject({ type: 'error', reason: 'memory' });
    expect(failures).toEqual([]);
  });

  it('supports external termination without treating a Worker heap limit as a process bound', async () => {
    const { worker, next } = open();
    await next();
    const started = performance.now();
    await worker.terminate();
    expect(performance.now() - started).toBeLessThan(1500);
    expect(worker.threadId).toBe(-1);
  });

  it('applies an attributable caller-supplied restore only through the canonical document validator', async () => {
    const { worker, next, document, failures } = open();
    await next();
    send(worker, {
      ...header,
      sequence: 1,
      type: 'restore',
      state: {
        version: 1,
        values: {
          ...initialGenuiDocumentState(document).values,
          filter: 'Gamma',
          selected: 'gamma',
        },
      },
    });
    const restored = await next();
    expect(restored).toMatchObject({
      type: 'snapshot',
      state: { values: { filter: 'Gamma', selected: 'gamma' } },
    });
    send(worker, {
      ...header,
      sequence: 2,
      type: 'restore',
      state: { version: 1, values: { injected: true } },
    });
    expect(await next()).toMatchObject({ type: 'error', sequence: 3, reason: 'invalid-content' });
    expect(failures).toEqual([]);
  });

  it('joins the real Worker to the trusted Supervisor and acknowledges a canonical restore', async () => {
    const worker = new Worker(entryPath);
    workers.push(worker);
    const replies: GenuiExecutionSnapshot[] = [];
    const waiters: ((reply: GenuiExecutionSnapshot) => void)[] = [];
    const port: GenuiExecutionPort = {
      send: (value) => send(worker, value),
      subscribe: (handlers) => {
        const message = (value: { reply: unknown }) => handlers.message(value.reply);
        const failure = () => handlers.failed();
        worker.on('message', message);
        worker.on('error', failure);
        return () => {
          worker.off('message', message);
          worker.off('error', failure);
        };
      },
      terminate: () => {
        void worker.terminate();
      },
    };
    const stops: unknown[] = [];
    const owner = new GenuiExecutionSupervisor({
      ...header,
      document: syntheticGenuiDocument,
      state: initialGenuiDocumentState(syntheticGenuiDocument),
      theme: 'light',
      createPort: () => port,
      onSnapshot: (reply) => {
        const waiter = waiters.shift();
        if (waiter) waiter(reply);
        else replies.push(reply);
      },
      onStopped: (reason) => stops.push(reason),
    });
    const next = () => {
      const ready = replies.shift();
      return ready
        ? Promise.resolve(ready)
        : new Promise<GenuiExecutionSnapshot>((resolve) => waiters.push(resolve));
    };
    try {
      expect((await next()).commandSequence).toBe(0);
      owner.send({
        type: 'restore',
        state: {
          version: 1,
          values: { ...initialGenuiDocumentState(syntheticGenuiDocument).values, filter: 'Gamma' },
        },
      });
      expect(await next()).toMatchObject({
        commandSequence: 1,
        state: { values: { filter: 'Gamma' } },
      });
      expect(stops).toEqual([]);
    } finally {
      owner.dispose();
    }
  });
});
