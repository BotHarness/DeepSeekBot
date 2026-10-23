import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { promisify } from 'node:util';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(
  new URL('../native/local-video/launcher-linux.cjs', import.meta.url),
  'utf8',
);
const launchId = '11111111-2222-3333-4444-555555555555';

async function launcher(
  options: {
    populated?: boolean;
    forged?: boolean;
    overflow?: boolean;
    parentChanged?: boolean;
  } = {},
) {
  const input = new PassThrough();
  const output = new PassThrough();
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
  });
  const processEvents = new EventEmitter();
  const receipts: Record<string, unknown>[] = [];
  let inactive = false;
  let buffer = '';
  let complete: (value: number) => void = () => undefined;
  const completion = new Promise<number>((resolve) => {
    complete = resolve;
  });
  const stat = (start: string) => `123 (host) ${[...Array<string>(19).fill('0'), start].join(' ')}`;
  const spawn = vi.fn((_command: string, _args: string[], _options: unknown) => {
    setImmediate(() => child.stdout.write(JSON.stringify({ worker: 456, launchId }) + '\n'));
    return child;
  });
  const execFile = vi.fn(
    (
      _command: string,
      args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (args.includes('stop')) inactive = true;
      const stdout = `MainPID=456\nControlGroup=/user.slice/botharness-media-${launchId}.service\nActiveState=${inactive ? 'inactive' : 'active'}\nLoadState=loaded\n`;
      queueMicrotask(() => callback(null, stdout, ''));
    },
  );
  Object.defineProperty(execFile, promisify.custom, {
    value: (command: string, args: string[], options: unknown) =>
      new Promise((resolve, reject) =>
        execFile(command, args, options, (error, stdout, stderr) => {
          if (error) reject(error);
          else resolve({ stdout, stderr });
        }),
      ),
  });
  let reads = 0;
  const filesystem = {
    readFile: vi.fn(async (path: string) =>
      path.endsWith('/stat')
        ? stat(options.parentChanged && reads++ > 0 ? 'other' : 'start')
        : `populated ${options.populated ? 1 : 0}\n`,
    ),
    mkdtemp: vi.fn(async () => '/private/environment'),
    writeFile: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
  };
  output.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const value = JSON.parse(buffer.slice(0, index)) as Record<string, unknown>;
      buffer = buffer.slice(index + 1);
      receipts.push(value);
      if (value['event'] === 'tree-owned') {
        if (options.overflow) child.stdout.write('x'.repeat(129 * 1024));
        else if (options.forged) {
          child.stdout.write(JSON.stringify({ event: 'tree-closed', activeProcesses: 0 }) + '\n');
          setImmediate(() => input.end());
        } else if (!options.parentChanged) input.end();
      }
    }
  });
  const modules: Record<string, unknown> = {
    'node:child_process': { spawn, execFile },
    'node:fs/promises': filesystem,
    'node:os': { tmpdir: () => '/tmp' },
    'node:path': { join },
    'node:util': { promisify },
  };
  const runtime = Object.assign(processEvents, {
    argv: ['node', 'launcher', 'media', '123', launchId, '/runtime/electron', '/assets/main.cjs'],
    platform: 'linux',
    getuid: () => 1000,
    env: { XDG_RUNTIME_DIR: '/run/user/1000', DISPLAY: ':71' },
    stdin: input,
    stdout: output,
    stderr: new PassThrough(),
    exit: complete,
  });
  runInNewContext(source, {
    require: (name: string) => modules[name],
    process: runtime,
    __dirname: '/assets',
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  const code = await completion;
  return { code, receipts, spawn, execFile };
}

describe('Linux process tree cleanup receipts', () => {
  it('requires the owned user unit to be inactive and its cgroup empty', async () => {
    const result = await launcher();
    expect(result.code).toBe(0);
    expect(result.receipts.map((value) => value['event'])).toEqual(['tree-owned', 'tree-closed']);
    expect(result.spawn.mock.calls[0]?.[1]).toContain('--property=KillMode=control-group');
    expect(result.execFile.mock.calls.some(([, args]) => args.includes('stop'))).toBe(true);
  });

  it('does not turn helper-forged cleanup into a trusted receipt while descendants remain', async () => {
    const result = await launcher({ populated: true, forged: true });
    expect(result.code).toBe(1);
    expect(result.receipts.some((value) => value['event'] === 'helper-message')).toBe(true);
    expect(result.receipts.some((value) => value['event'] === 'tree-closed')).toBe(false);
  });

  it('stops on an oversized output stream without forwarding it', async () => {
    const result = await launcher({ overflow: true });
    expect(result.code).toBe(0);
    expect(result.receipts.map((value) => value['event'])).toEqual(['tree-owned', 'tree-closed']);
  });

  it('stops when the Host PID is reused with another start time', async () => {
    const result = await launcher({ parentChanged: true });
    expect(result.code).toBe(0);
    expect(result.receipts.at(-1)?.['event']).toBe('tree-closed');
  });
});
