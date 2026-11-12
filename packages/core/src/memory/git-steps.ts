import { execFileBuffer } from '../process/exec-off-thread.js';
import { execFileSync, type ExecFileSyncOptionsWithBufferEncoding } from 'node:child_process';

export interface GitCommand {
  args: string[];
  options: ExecFileSyncOptionsWithBufferEncoding;
}

export type GitSteps<T> = Generator<GitCommand, T, Buffer>;

export function syncGitSteps<T>(steps: GitSteps<T>): T {
  let step = steps.next();
  while (!step.done) {
    let result: Buffer;
    try {
      result = execFileSync('git', step.value.args, step.value.options);
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
    let result: Buffer;
    try {
      const options = command.options;
      result = (
        await execFileBuffer('git', command.args, {
          cwd: typeof options.cwd === 'string' ? options.cwd : undefined,
          env: options.env,
          timeout: options.timeout,
          maxBuffer: options.maxBuffer,
          windowsHide: options.windowsHide,
          stdio: Array.isArray(options.stdio)
            ? (options.stdio as ('ignore' | 'pipe')[])
            : undefined,
        })
      ).stdout;
    } catch (error) {
      step = steps.throw(error);
      continue;
    }
    step = steps.next(result);
  }
  return step.value;
}
