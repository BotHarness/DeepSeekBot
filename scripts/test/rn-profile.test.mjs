import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';
import { expect, it } from 'vitest';

const { WebSocketServer } = createRequire(
  new URL('../../packages/core/package.json', import.meta.url),
)('ws');
const script = fileURLToPath(new URL('../../apps/mobile/scripts/rn-profile.mjs', import.meta.url));
const profile = {
  startTime: 1_000_000,
  endTime: 1_500_000,
  nodes: [
    {
      id: 1,
      callFrame: { functionName: '(root)', url: '', lineNumber: 0, columnNumber: 0 },
      children: [2, 3],
    },
    {
      id: 2,
      callFrame: {
        functionName: 'syntheticWork',
        url: 'fixture.js',
        lineNumber: 0,
        columnNumber: 0,
      },
    },
    { id: 3, callFrame: { functionName: '(idle)', url: '', lineNumber: 0, columnNumber: 0 } },
  ],
  samples: [2, 3],
  timeDeltas: [250_000, 250_000],
};

function inspectorRuntime(reactHook = false) {
  let now = 1000;
  const frames = [];
  const runtime = createContext({
    performance: { now: () => now },
    requestAnimationFrame: (callback) => frames.push(callback),
    ...(reactHook ? { __REACT_DEVTOOLS_GLOBAL_HOOK__: { onCommitFiberRoot() {} } } : {}),
  });
  return {
    runtime,
    now: () => now,
    advance(time, kind = 'frame') {
      now = time;
      if (kind === 'frame') for (const callback of frames.splice(0)) callback(time);
      else if (kind === 'commit' && reactHook)
        runtime.__REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot(1, {
          current: {
            tag: 0,
            type: { displayName: 'FixtureEditor' },
            actualDuration: 2,
            selfBaseDuration: 1,
            flags: 1,
            alternate: {},
            child: null,
            sibling: null,
          },
        });
      return frames.length;
    },
  };
}

async function capture(
  args = [],
  {
    reactHook = false,
    state = inspectorRuntime(reactHook),
    rejectStart = false,
    interrupt,
    interruptAfterStart = false,
    ignoreCleanup = false,
  } = {},
) {
  const out = mkdtempSync(join(tmpdir(), 'rn-profile-cli-'));
  let startRequested = false;
  const commands = [];
  const { runtime } = state;
  const server = createServer((request, response) => {
    if (request.url !== '/json/list') {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify([
        {
          title: 'Synthetic inspector',
          webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/inspector`,
        },
      ]),
    );
  });
  const sockets = new WebSocketServer({ server });
  sockets.on('connection', (socket) => {
    socket.on('message', (raw) => {
      const { id, method, params } = JSON.parse(String(raw));
      commands.push(method);
      let result = {};
      if (method === 'Runtime.evaluate') {
        if (ignoreCleanup && startRequested) return;
        try {
          result = { result: { value: runInContext(params.expression, runtime) } };
        } catch (error) {
          result = { exceptionDetails: { text: error.message } };
        }
      } else if (method === 'Profiler.start') {
        startRequested = true;
        if (interrupt && !interruptAfterStart) {
          child.kill(interrupt);
          return;
        }
        if (rejectStart) {
          socket.send(
            JSON.stringify({ id, error: { message: 'synthetic Profiler.start refusal' } }),
          );
          return;
        }
        const start = state.now();
        for (const [offset, kind] of [
          [16, 'frame'],
          [32, 'frame'],
          [100, 'commit'],
          [300, 'frame'],
          [400, 'commit'],
          [490, 'frame'],
        ])
          state.advance(start + offset, kind);
        state.advance(start + 500, 'clock');
      } else if (method === 'Profiler.stop') result = { profile };
      socket.send(JSON.stringify({ id, result }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let child;
  try {
    child = spawn(
      process.execPath,
      [
        script,
        '--metro',
        String(server.address().port),
        '--out',
        out,
        '--max',
        '0.1',
        ...(interruptAfterStart ? ['--run', 'printf profile-started'] : []),
        ...args,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (interruptAfterStart && String(chunk).includes('profile-started')) child.kill(interrupt);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 5000);
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    }).finally(() => clearTimeout(timeout));
    const json = (name) =>
      existsSync(join(out, name)) ? JSON.parse(readFileSync(join(out, name), 'utf8')) : undefined;
    return {
      code,
      commands,
      timedOut,
      rescheduledFrames: state.advance(state.now() + 16),
      stdout,
      stderr,
      summary: json('summary.json'),
      cpu: json('profile.cpuprofile'),
      react: json('react.json'),
      jsFrames: json('js-frames.json'),
    };
  } finally {
    if (child?.exitCode === null) child.kill();
    for (const socket of sockets.clients) socket.terminate();
    await new Promise((resolve) => sockets.close(resolve));
    await new Promise((resolve) => server.close(resolve));
    rmSync(out, { recursive: true, force: true });
  }
}

it('captures production JS without a React hook only when explicitly opted in', async () => {
  const result = await capture(['--no-react']);
  expect(result.code, result.stderr).toBe(0);
  expect(result.cpu).toEqual(profile);
  expect(result.commands.filter((method) => method === 'Profiler.stop')).toHaveLength(1);
  expect(result.summary).toMatchObject({
    mode: 'js-only',
    react: null,
    reactUnavailableReason: 'disabled-by--no-react',
    capture: { jsDurationSeconds: 0.5, cpuDurationSeconds: 0.5 },
    frames: {
      source: 'javascript-requestAnimationFrame',
      window: 'capture',
      windowSeconds: 0.5,
      jsFps: 8,
    },
  });
  expect(result.react).toBeUndefined();
  expect(result.jsFrames).toEqual({
    mode: 'js-only',
    clock: 'performance.now',
    start: 1000,
    end: 1500,
    frames: [1016, 1032, 1300, 1490],
  });
});

it('keeps the default strict instead of silently downgrading a missing React hook', async () => {
  const result = await capture();
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('no __REACT_DEVTOOLS_GLOBAL_HOOK__');
  expect(result.summary).toBeUndefined();
  expect(result.cpu).toBeUndefined();
  expect(result.jsFrames).toBeUndefined();
});

it('preserves the default React capture and commit-window frame metrics', async () => {
  const result = await capture([], { reactHook: true });
  expect(result.code, result.stderr).toBe(0);
  expect(result.summary).toMatchObject({
    mode: 'react-and-js',
    reactUnavailableReason: null,
    react: {
      commits: 2,
      streamWindowSeconds: 0.3,
      commitRenderMsTotal: 4,
      components: { FixtureEditor: [2, 0] },
    },
    frames: { window: 'react-commits', windowSeconds: 0.3, jsFps: 3.3 },
  });
  expect(result.react.commits).toEqual([1100, 1400]);
  expect(result.jsFrames).toBeUndefined();
});

it('honors explicit JS-only mode even when a React hook is available', async () => {
  const result = await capture(['--no-react'], { reactHook: true });
  expect(result.code, result.stderr).toBe(0);
  expect(result.summary.react).toBeNull();
  expect(result.react).toBeUndefined();
  expect(result.jsFrames.frames).toEqual([1016, 1032, 1300, 1490]);
});

it('stops JS frame callbacks when Profiler.start rejects before collection', async () => {
  const result = await capture(['--no-react'], { rejectStart: true });
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('synthetic Profiler.start refusal');
  expect(result.commands).not.toContain('Profiler.stop');
  expect(result.rescheduledFrames).toBe(0);
});

it('stops a previous uncatchably terminated collector before the next capture', async () => {
  const state = inspectorRuntime();
  const interrupted = await capture(['--no-react'], { state, interrupt: 'SIGKILL' });
  expect(interrupted.rescheduledFrames).toBe(1);
  const next = await capture(['--no-react'], { state });
  expect(next.code, next.stderr).toBe(0);
  expect(next.rescheduledFrames).toBe(0);
});

it.skipIf(process.platform === 'win32').each([
  ['SIGINT', 130],
  ['SIGTERM', 143],
])('cleans up its JS frames on POSIX %s', async (interrupt, code) => {
  const result = await capture(['--no-react'], { interrupt, interruptAfterStart: true });
  expect(result.code).toBe(code);
  expect(result.commands.filter((method) => method === 'Profiler.stop')).toHaveLength(1);
  expect(result.rescheduledFrames).toBe(0);
  expect(result.summary).toBeUndefined();
});

it('bounds cleanup when the inspector stops answering and reports it as unconfirmed', async () => {
  const result = await capture(['--no-react'], { rejectStart: true, ignoreCleanup: true });
  expect(result.timedOut).toBe(false);
  expect(result.code).toBe(1);
  expect(result.stderr).toContain('JS-only cleanup unconfirmed');
  expect(result.summary).toBeUndefined();
  expect(result.rescheduledFrames).toBe(1);
});

it.skipIf(process.platform === 'win32')(
  'does not stop an unacknowledged CPU profiler start on POSIX interruption',
  async () => {
    const result = await capture(['--no-react'], { interrupt: 'SIGINT' });
    expect(result.code).toBe(130);
    expect(result.commands).not.toContain('Profiler.stop');
    expect(result.stderr).toContain('CPU profiler start unconfirmed');
    expect(result.rescheduledFrames).toBe(0);
  },
);
