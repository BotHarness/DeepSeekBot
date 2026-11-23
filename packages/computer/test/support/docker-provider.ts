import type { ComputerRuntimeResult, ComputerRuntimeRunner } from '../../src/provider.js';

export function runnerWith(
  handler: (argv: readonly string[]) => ComputerRuntimeResult,
  calls: string[][] = [],
): ComputerRuntimeRunner {
  return {
    run: async (argv) => {
      calls.push([...argv]);
      return handler(argv);
    },
  };
}

export const ok = (stdout = ''): ComputerRuntimeResult => ({ code: 0, stdout, stderr: '' });

export const fail = (stderr: string, code = 1): ComputerRuntimeResult => ({
  code,
  stdout: '',
  stderr,
});

export const fetchOk = (): Promise<Response> =>
  Promise.resolve({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response);

export function specLine(
  patch: {
    image?: string;
    memory?: string;
    swap?: string;
    nanoCpus?: string;
    shm?: string;
    pids?: string;
    env?: readonly string[];
  } = {},
): ComputerRuntimeResult {
  const image = patch.image ?? 'lscr.io/linuxserver/webtop:ubuntu-xfce';
  const memory = patch.memory ?? String(4 * 1024 ** 3);
  const swap = patch.swap ?? memory;
  const nanoCpus = patch.nanoCpus ?? String(2_000_000_000);
  const shm = patch.shm ?? String(512 * 1024 ** 2);
  const pids = patch.pids ?? '4096';
  const env = patch.env ?? [
    'HARDEN_DESKTOP=false',
    'MAX_RES=1280x800',
    'SELKIES_MANUAL_WIDTH=1280',
    'SELKIES_MANUAL_HEIGHT=800',
    'SELKIES_ENABLE_RESIZE=false',
    'PIXELFLUX_WAYLAND=false',
  ];
  return ok(`${image}|${memory}|${swap}|${nanoCpus}|${shm}|${pids}|${env.join('\n')}\n`);
}
