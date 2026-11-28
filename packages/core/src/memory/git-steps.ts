import { execFileBuffer } from '../process/exec-off-thread.js';
import { execFileSync, type ExecFileSyncOptionsWithBufferEncoding } from 'node:child_process';

export interface GitCommand {
  args: string[];
  options: ExecFileSyncOptionsWithBufferEncoding;
}

export type GitSteps<T> = Generator<GitCommand, T, Buffer>;

const MEMORY_GIT_TIMEOUT_MS = 30_000;

export class MemoryGitTimeoutError extends Error {
  constructor(
    readonly elapsedMs: number,
    readonly timeoutMs: number,
  ) {
    super('Memory Git operation timed out');
  }
}

export function syncGitSteps<T>(steps: GitSteps<T>): T {
  let step = steps.next();
  while (!step.done) {
    let result: Buffer;
    try {
      result = execFileSync('git', step.value.args, {
        ...step.value.options,
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      step = steps.throw(error);
      continue;
    }
    step = steps.next(result);
  }
  return step.value;
}

export async function asyncGitSteps<T>(steps: GitSteps<T>): Promise<T> {
  let step = steps.next();
  while (!step.done) {
    const command = step.value;
    const startedAt = performance.now();
    let result: Buffer;
    try {
      const options = command.options;
      result = (
        await execFileBuffer('git', command.args, {
          cwd: typeof options.cwd === 'string' ? options.cwd : undefined,
          env: options.env,
          timeout: MEMORY_GIT_TIMEOUT_MS,
          killSignal: 'SIGKILL',
          maxBuffer: options.maxBuffer,
          windowsHide: options.windowsHide,
          stdio: Array.isArray(options.stdio)
            ? (options.stdio as ('ignore' | 'pipe')[])
            : undefined,
        })
      ).stdout;
    } catch (error) {
      if (error instanceof Error && 'killed' in error && error.killed === true) {
        const interruptedSteps: Iterator<GitCommand, unknown, Buffer> = steps;
        interruptedSteps.return?.();
        throw new MemoryGitTimeoutError(
          Math.round(performance.now() - startedAt),
          MEMORY_GIT_TIMEOUT_MS,
        );
      }
      step = steps.throw(error);
      continue;
    }
    step = steps.next(result);
  }
  return step.value;
}
