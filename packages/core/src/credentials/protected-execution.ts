import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { PrivateInputLog } from './diagnostics.js';

const execute = promisify(execFile);
export const PRIVATE_COMMAND_IMAGE =
  'node@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392';
const AUTHENTICATED_STATUS_CLI = String.raw`
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => { input+=c; if(input.length>60000) process.exit(2); });
process.stdin.on('end', async () => {
  try {
    const values=JSON.parse(input); input='';
    const url=new URL(values.endpoint);
    if(!['https:','http:'].includes(url.protocol) || url.username || url.password) process.exit(2);
    if(url.protocol==='http:' && !['127.0.0.1','localhost','[::1]'].includes(url.hostname)) process.exit(2);
    const response=await fetch(url, {method:'GET', redirect:'error',
      headers:{'x-api-key':values.api_key,'x-api-secret':values.api_secret}, signal:AbortSignal.timeout(10000)});
    await response.body?.cancel();
    process.stdout.write(String(response.status));
  } catch { process.exitCode=2; }
});
`;

export function privateCommandArgs(name: string): string[] {
  return [
    'run',
    '--rm',
    '--interactive',
    '--name',
    name,
    '--label',
    'ai.botharness.private-command=true',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges=true',
    '--user',
    '65534:65534',
    '--pids-limit',
    '64',
    '--memory',
    '128m',
    '--cpus',
    '1',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=16m',
    '--workdir',
    '/tmp',
    '--entrypoint',
    '/bin/sh',
    PRIVATE_COMMAND_IMAGE,
    '-s',
  ];
}
export class ProtectedExecution {
  #closed = false;
  readonly #children = new Set<ReturnType<typeof spawn>>();
  readonly #containers = new Set<string>();
  readonly #groups = new Set<string>();
  constructor(readonly log: PrivateInputLog) {}

  async qualified(): Promise<boolean> {
    if (this.#closed) return false;
    try {
      const result = await execute('docker', ['info', '--format', '{{.OSType}}'], {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 1024,
      });
      await execute('docker', ['image', 'inspect', PRIVATE_COMMAND_IMAGE], {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 64_000,
      });
      return result.stdout.trim() === 'linux';
    } catch {
      return false;
    }
  }

  async command(command: string, signal: AbortSignal): Promise<string> {
    if (command.length > 16_000 || signal.aborted || !(await this.qualified()))
      throw new Error('Protected command execution is unavailable');
    const name = 'botharness-private-command-' + randomUUID();
    this.#containers.add(name);
    const started = Date.now();
    this.log('command-started', { program: 'isolated-shell' });
    try {
      const output = await this.#spawn('docker', privateCommandArgs(name), command, signal, false);
      this.log('command-completed', {
        program: 'isolated-shell',
        durationMs: Date.now() - started,
      });
      return output;
    } finally {
      await this.#remove(name);
    }
  }

  async authenticatedStatus(
    values: Record<string, string>,
    signal: AbortSignal,
  ): Promise<{ consumer: string; successful: boolean; httpStatus: number; action?: string }> {
    if (Object.keys(values).sort().join(',') !== 'api_key,api_secret,endpoint')
      throw new Error('http-status-v1 requires endpoint, api_key and api_secret references');
    if (signal.aborted || this.#closed) throw new Error('Protected credential execution cancelled');
    const started = Date.now();
    this.log('credential-cli-started', { program: 'http-status-v1' });
    const output = await this.#spawn(
      process.execPath,
      ['--disable-proto=throw', '-e', AUTHENTICATED_STATUS_CLI],
      JSON.stringify(values),
      signal,
      true,
    );
    if (!/^[1-5][0-9]{2}$/.test(output))
      throw new Error('Protected CLI returned an invalid nonsecret result');
    const httpStatus = Number(output);
    this.log('credential-cli-completed', {
      program: 'http-status-v1',
      durationMs: Date.now() - started,
    });
    return {
      consumer: 'http-status-v1',
      successful: httpStatus >= 200 && httpStatus < 300,
      httpStatus,
      ...([401, 403].includes(httpStatus)
        ? {
            action:
              'Replace private information in Web Chat and retry; remote authorization may also need repair.',
          }
        : {}),
    };
  }

  #spawn(
    program: string,
    args: string[],
    stdin: string,
    signal: AbortSignal,
    credentialBearing: boolean,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.#closed || signal.aborted) {
        reject(new Error('Protected execution cancelled'));
        return;
      }
      const child = spawn(program, args, {
        windowsHide: true,
        cwd: tmpdir(),
        stdio: ['pipe', 'pipe', 'pipe'],
        ...(credentialBearing
          ? { env: process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {} }
          : {}),
      });
      this.#children.add(child);
      let output = '';
      let failed = false;
      const limit = credentialBearing ? 3 : 16_000;
      const stop = () => {
        failed = true;
        child.kill();
      };
      const timer = setTimeout(stop, credentialBearing ? 15_000 : 30_000);
      signal.addEventListener('abort', stop, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        output += chunk.toString('utf8');
        if (output.length > limit) {
          output = '';
          stop();
        }
      });
      child.stderr.on('data', () => undefined);
      child.stdin.on('error', () => stop());
      child.on('error', () => {
        failed = true;
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
        this.#children.delete(child);
        if (failed || code !== 0 || signal.aborted) {
          this.log('execution-failed');
          reject(new Error('Protected execution failed or was cancelled'));
        } else resolve(output);
      });
      child.stdin.end(stdin);
    });
  }

  async #remove(name: string): Promise<void> {
    try {
      await execute('docker', ['rm', '--force', name], {
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 1024,
      });
      this.#containers.delete(name);
    } catch {
      try {
        const { stdout } = await execute(
          'docker',
          ['ps', '--all', '--quiet', '--filter', 'name=^/' + name + '$'],
          { windowsHide: true, timeout: 10_000, maxBuffer: 1024 },
        );
        if (!stdout.trim()) {
          this.#containers.delete(name);
          return;
        }
      } catch {}
      this.log('container-cleanup-failed');
    }
  }

  trackContainer(name: string): () => Promise<void> {
    if (this.#closed) throw new Error('Protected execution is closed');
    this.#containers.add(name);
    let cleanup: Promise<void> | undefined;
    return () => (cleanup ??= this.#remove(name));
  }

  trackContainerGroup(label: string): () => Promise<void> {
    if (this.#closed || !/^ai\.botharness\.mcp-owner=[0-9a-f-]{36}$/.test(label))
      throw new Error('Invalid Linux MCP owner');
    this.#groups.add(label);
    let cleanup: Promise<void> | undefined;
    return () => (cleanup ??= this.#removeGroup(label));
  }

  async #removeGroup(label: string): Promise<void> {
    try {
      const { stdout } = await execute(
        'docker',
        ['ps', '--all', '--quiet', '--filter', 'label=' + label],
        { windowsHide: true, timeout: 10_000, maxBuffer: 4096 },
      );
      const ids = stdout.trim().split(/\s+/).filter(Boolean);
      if (ids.some((id) => !/^[0-9a-f]{12,64}$/.test(id)))
        throw new Error('Invalid container identity');
      if (ids.length)
        await execute('docker', ['rm', '--force', ...ids], {
          windowsHide: true,
          timeout: 10_000,
          maxBuffer: 4096,
        });
      this.#groups.delete(label);
    } catch {
      this.log('container-cleanup-failed');
    }
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const child of this.#children) child.kill();
    await Promise.allSettled([...this.#containers].map((name) => this.#remove(name)));
    await Promise.allSettled([...this.#groups].map((label) => this.#removeGroup(label)));
  }
}
