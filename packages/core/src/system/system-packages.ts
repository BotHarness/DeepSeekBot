import { spawn } from 'node:child_process';

export interface SystemCommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface SystemCommandRunner {
  run(argv: readonly string[]): Promise<SystemCommandResult>;
  runStreaming?(
    argv: readonly string[],
    onChunk: (chunk: string) => void,
  ): Promise<SystemCommandResult>;
}

export function createSpawnRunner(): SystemCommandRunner {
  const once = (
    argv: readonly string[],
    onChunk?: (chunk: string) => void,
  ): Promise<SystemCommandResult> =>
    new Promise((resolve) => {
      const child = spawn(argv[0] ?? '', argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        onChunk?.(chunk.toString());
      });
      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 20_000) stderr += chunk.toString();
      });
      child.on('error', (error) =>
        resolve({ code: -1, stdout, stderr: `${stderr}${String(error)}` }),
      );
      child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });
  return { run: (argv) => once(argv), runStreaming: (argv, onChunk) => once(argv, onChunk) };
}

export type SystemInstallAccess = 'root' | 'sudo' | 'none';

export interface SystemInstallProgress {
  readonly percent: number;
  readonly text: string;
}

export function aptInstallCommand(packages: readonly string[]): string {
  return `sudo apt install -y ${packages.join(' ')}`;
}

export async function systemInstallAccess(
  runner: SystemCommandRunner,
  host: { platform?: string; uid?: number | undefined } = {},
): Promise<SystemInstallAccess> {
  if ((host.platform ?? process.platform) !== 'linux') return 'none';
  const which = await runner.run(['sh', '-c', 'command -v apt-get']);
  if (which.code !== 0) return 'none';
  if ((host.uid ?? process.getuid?.()) === 0) return 'root';
  const sudo = await runner.run(['sudo', '-n', 'true']);
  return sudo.code === 0 ? 'sudo' : 'none';
}

const STAGES = {
  update: { from: 0, to: 20 },
  install: { from: 20, to: 100 },
} as const;

export function parseAptStatus(
  line: string,
  stage: keyof typeof STAGES,
): SystemInstallProgress | undefined {
  const match = /^(dlstatus|pmstatus):[^:]*:([\d.]+):(.*)$/.exec(line.trim());
  if (match === null) return undefined;
  const value = Math.max(0, Math.min(100, Number(match[2])));
  const { from, to } = STAGES[stage];
  return {
    percent: Math.floor(from + ((to - from) * value) / 100),
    text: match[3]?.trim() ?? '',
  };
}

export async function installSystemPackages(options: {
  packages: readonly string[];
  access: SystemInstallAccess;
  runner: SystemCommandRunner;
  onProgress?: ((progress: SystemInstallProgress) => void) | undefined;
}): Promise<void> {
  if (options.access === 'none')
    throw new Error(
      `Installing needs administrator rights: ${aptInstallCommand(options.packages)}`,
    );
  const stream = options.runner.runStreaming;
  if (stream === undefined) throw new Error('This Host cannot stream an install');
  const prefix = [
    ...(options.access === 'sudo' ? ['sudo', '-n'] : []),
    'env',
    'DEBIAN_FRONTEND=noninteractive',
    'apt-get',
    '-o',
    'APT::Status-Fd=1',
  ];
  for (const [stage, args] of [
    ['update', ['update']],
    ['install', ['install', '-y', '--no-install-recommends', ...options.packages]],
  ] as const) {
    let pending = '';
    options.onProgress?.({ percent: STAGES[stage].from, text: `apt-get ${stage}` });
    const result = await stream.call(options.runner, [...prefix, ...args], (chunk) => {
      pending += chunk;
      const lines = pending.split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const progress = parseAptStatus(line, stage);
        if (progress !== undefined) options.onProgress?.(progress);
      }
    });
    if (result.code !== 0) {
      const tail = result.stderr.trim().split('\n').slice(-3).join(' ');
      throw new Error(`apt-get ${stage} failed (exit ${String(result.code)}): ${tail}`);
    }
  }
  options.onProgress?.({ percent: 100, text: 'done' });
}
