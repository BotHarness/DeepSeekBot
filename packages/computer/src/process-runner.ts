import { spawn } from 'node:child_process';
import type {
  ComputerRuntimeResult,
  ComputerRuntimeRunner,
  ComputerRuntimeRunOptions,
} from './provider.js';

export function createProcessRunner(): ComputerRuntimeRunner {
  const spawnOnce = (
    argv: readonly string[],
    onChunk?: (chunk: string) => void,
    options?: ComputerRuntimeRunOptions,
  ): Promise<ComputerRuntimeResult> =>
    new Promise((resolve) => {
      if (options?.signal?.aborted) {
        resolve({ code: -1, stdout: '', stderr: 'Computer subprocess cancelled before start' });
        return;
      }
      const child = spawn(argv[0] ?? '', argv.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(options?.env === undefined ? {} : { env: { ...process.env, ...options.env } }),
        shell: false,
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let refusal: string | undefined;
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let stopTimeout: ReturnType<typeof setTimeout> | undefined;
      const finish = (code: number): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(stopTimeout);
        options?.signal?.removeEventListener('abort', abort);
        resolve({ code: refusal === undefined ? code : -1, stdout, stderr: refusal ?? stderr });
      };
      const stop = (reason: string): void => {
        if (settled || refusal !== undefined) return;
        refusal = reason;
        child.kill('SIGKILL');
        stopTimeout = setTimeout(() => {
          child.stdout.destroy();
          child.stderr.destroy();
          finish(-1);
        }, 2_000);
      };
      const abort = (): void => stop('Computer subprocess cancelled');
      options?.signal?.addEventListener('abort', abort, { once: true });
      if (options?.signal?.aborted) abort();
      if (options?.timeoutMs !== undefined)
        timeout = setTimeout(() => stop('Computer subprocess timed out'), options.timeoutMs);
      const append = (chunk: Buffer): string | undefined => {
        if (settled || refusal !== undefined) return undefined;
        outputBytes += chunk.byteLength;
        if (options?.maxOutputBytes !== undefined && outputBytes > options.maxOutputBytes) {
          stop('Computer subprocess output limit exceeded');
          return undefined;
        }
        return chunk.toString();
      };
      child.stdout.on('data', (chunk: Buffer) => {
        const text = append(chunk);
        if (text === undefined) return;
        stdout += text;
        onChunk?.(text);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const text = append(chunk);
        if (text === undefined) return;
        stderr += text;
        onChunk?.(text);
      });
      child.on('error', (error) => {
        stderr = `${stderr}${String(error)}`;
        finish(-1);
      });
      child.on('close', (code) => {
        finish(code ?? -1);
      });
    });

  return {
    run: (argv, options) => spawnOnce(argv, undefined, options),
    runStreaming: (argv, onChunk) => spawnOnce(argv, onChunk),
  };
}
