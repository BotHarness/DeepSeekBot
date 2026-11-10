import {
  execFile,
  execFileSync,
  type ExecFileSyncOptionsWithBufferEncoding,
} from 'node:child_process';

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
      result = await new Promise<Buffer>((resolve, reject) => {
        execFile(
          'git',
          command.args,
          { ...command.options, encoding: 'buffer' },
          (error, stdout) => {
            if (error) reject(error);
            else resolve(stdout);
          },
        );
      });
    } catch (error) {
      step = steps.throw(error);
      continue;
    }
    step = steps.next(result);
  }
  return step.value;
}
