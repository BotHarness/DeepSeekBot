import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vitest';
import { callConnectionDiagnostics } from '../src/media/call-connection-diagnostics.js';

const snapshot = (seq = 1) => ({
  seq,
  elapsedMs: seq * 10,
  stage: 'ice',
  peer: 'connecting',
  ice: 'checking',
  gathering: 'complete',
  localCandidates: 2,
  remoteCandidates: 1,
});

it('logs only bounded ordered primitive connection facts', () => {
  const log = vi.fn();
  const receive = callConnectionDiagnostics(log);
  receive({ ...snapshot(), sdp: 'private-sdp', ip: 'private-ip', callId: 'forged-call' });
  receive(snapshot());
  receive({ ...snapshot(2), elapsedMs: 0 });
  receive({ ...snapshot(3), peer: 'private-error-text' });
  receive({ ...snapshot(4), localCandidates: Infinity });
  receive({ ...snapshot(5), remoteCandidates: -1 });
  receive(snapshot(6));
  expect(log).toHaveBeenCalledTimes(2);
  expect(log.mock.calls.flat().join(' ')).not.toMatch(/private|forged/);
  expect(log.mock.calls[1]?.[0]).toContain('seq=6');
});

it('bounds untrusted diagnostic frames without throwing or releasing lifecycle state', () => {
  const log = vi.fn();
  const receive = callConnectionDiagnostics(log);
  for (let seq = 1; seq <= 100; seq++) receive(snapshot(seq));
  expect(log).toHaveBeenCalledTimes(32);
  expect(() => receive(null)).not.toThrow();
});

it('does not let a throwing diagnostic observer escape into call lifecycle', () => {
  const receive = callConnectionDiagnostics(() => {
    throw new Error('observer unavailable');
  });
  expect(() => receive(snapshot())).not.toThrow();
});

it('keeps renderer diagnostics off by default and reserves terminal snapshot capacity', () => {
  const source = readFileSync(
    new URL('../native/local-video/call-renderer.js', import.meta.url),
    'utf8',
  );
  const connection = vi.fn();
  const bridge = { diagnosticsEnabled: false, connection, ready: vi.fn() };
  const context = {
    window: { callBridge: bridge, addEventListener: vi.fn() },
    performance: { now: () => 100 },
    Map,
    clearTimeout,
    setTimeout,
  };
  runInNewContext(
    source +
      `
    peer = { connectionState: 'connecting', iceConnectionState: 'checking', iceGatheringState: 'complete',
      localDescription: {sdp: 'a=candidate:private-address\\r\\n'}, remoteDescription: {sdp: 'a=candidate:private-remote\\r\\n'} };
    connectionDiagnostic('ice');
    window.callBridge.diagnosticsEnabled = true;
    for (let i = 0; i < 100; i++) connectionDiagnostic('ice');
    peer.iceConnectionState = 'failed'; connectionDiagnostic('ice');
    peer.connectionState = 'closed'; connectionDiagnostic('peer');
    connectionDiagnostic('peer');
  `,
    context,
  );
  expect(connection).toHaveBeenCalledTimes(32);
  expect(connection.mock.calls[0]?.[0]).toMatchObject({
    seq: 1,
    localCandidates: 1,
    remoteCandidates: 1,
  });
  expect(connection.mock.calls[30]?.[0]).toMatchObject({
    seq: 31,
    ice: 'failed',
    peer: 'connecting',
  });
  expect(connection.mock.calls[31]?.[0]).toMatchObject({ seq: 32, peer: 'closed' });
  expect(JSON.stringify(connection.mock.calls)).not.toContain('private');
});

async function main(enabled: boolean) {
  const source = readFileSync(
    new URL('../native/local-video/call-main.cjs', import.meta.url),
    'utf8',
  );
  const ipcMain = new EventEmitter();
  const commands = Object.assign(new EventEmitter(), { setEncoding: vi.fn() });
  const frame = {};
  const exit = vi.fn();
  const stdout = Object.assign(new EventEmitter(), { write: vi.fn(), writableLength: 0 });
  const window = {
    webContents: { mainFrame: frame, setWindowOpenHandler: vi.fn(), on: vi.fn() },
    on: vi.fn(),
    loadFile: async () => undefined,
  };
  const app = {
    setPath: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
    whenReady: async () => undefined,
    exit,
  };
  const partition = {
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
  };
  runInNewContext(source, {
    require: (name: string) => {
      if (name === 'electron')
        return {
          app,
          BrowserWindow: function () {
            return window;
          },
          ipcMain,
          session: { fromPartition: () => partition },
        };
      if (name === 'node:path') return { join: (...parts: string[]) => parts.join('/') };
      if (name === 'node:fs') return { createReadStream: () => commands };
      throw new Error('Unexpected module');
    },
    process: {
      env: { BOTHARNESS_CALL_DIAGNOSTICS: enabled ? '1' : '' },
      platform: 'win32',
      versions: { electron: '44.9.3' },
      stdout,
      on: vi.fn(),
    },
    __dirname: '/fixture',
    Buffer,
  });
  await Promise.resolve();
  return {
    send: (value: unknown, owned = true) =>
      ipcMain.emit('call-connection', { senderFrame: owned ? frame : {} }, value),
    stdout,
    exit,
  };
}

it('accepts diagnostics only from the owned frame and strips extra payload at the helper boundary', async () => {
  const h = await main(true);
  h.send(snapshot(), false);
  h.send({ ...snapshot(), ip: 'private-ip', sdp: 'private-sdp' });
  h.send({ ...snapshot(2), stage: 'private-stage' });
  expect(h.stdout.write).toHaveBeenCalledTimes(1);
  expect(h.stdout.write.mock.calls[0]?.[0]).not.toContain('private');
  expect(h.exit).not.toHaveBeenCalled();
});

it('drops disabled, over-budget or backpressured diagnostics without changing lifecycle', async () => {
  const disabled = await main(false);
  disabled.send(snapshot());
  expect(disabled.stdout.write).not.toHaveBeenCalled();
  const limited = await main(true);
  for (let seq = 1; seq < 100; seq++) limited.send(snapshot(seq));
  expect(limited.stdout.write).toHaveBeenCalledTimes(32);
  expect(limited.exit).not.toHaveBeenCalled();
  const busy = await main(true);
  busy.stdout.writableLength = 128 * 1024;
  busy.send(snapshot());
  expect(busy.stdout.write).not.toHaveBeenCalled();
  expect(busy.exit).not.toHaveBeenCalled();
  const throwing = await main(true);
  throwing.stdout.write.mockImplementation(() => {
    throw new Error('write unavailable');
  });
  expect(() => throwing.send(snapshot())).not.toThrow();
  expect(throwing.exit).not.toHaveBeenCalled();
});
