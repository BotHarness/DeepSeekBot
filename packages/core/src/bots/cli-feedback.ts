import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { BotCreateCliIo } from './bot-create-cli.js';
import type { connectLiveHost } from './cli-live.js';
import { CliLiveError } from './cli-live-error.js';

export const FEEDBACK_COMMANDS = [
  {
    command: 'feedback-preview',
    description: 'preview single-message feedback evidence using JSON from stdin',
  },
  {
    command: 'feedback-download',
    description: 'download frozen feedback evidence; stdin token and --out required',
  },
  {
    command: 'feedback-submit',
    description: 'submit reviewed feedback using JSON from stdin; needs --confirm',
  },
] as const;

export async function runFeedbackCommand(
  command: string,
  values: { out?: string; confirm?: boolean },
  io: BotCreateCliIo,
  connect: () => Promise<Awaited<ReturnType<typeof connectLiveHost>>>,
): Promise<unknown> {
  if (command === 'feedback-submit' && !values.confirm)
    throw new CliLiveError('usage', 'Pass --confirm to submit the reviewed evidence.');
  if (command === 'feedback-download' && !values.out)
    throw new CliLiveError('usage', 'Pass --out for the diagnostic ZIP.');
  let input: Record<string, unknown>;
  try {
    input = z.record(z.string(), z.unknown()).parse(JSON.parse((await io.readStdin?.()) ?? ''));
  } catch {
    throw new CliLiveError('usage', 'Provide feedback JSON on stdin.');
  }
  const host = await connect();
  const path =
    command === 'feedback-preview'
      ? '/api/botharness/message-feedback/preview'
      : command === 'feedback-download'
        ? '/api/botharness/message-feedback/download'
        : '/api/botharness/message-feedback/submit';
  const result = await host.http(path, input);
  if (command === 'feedback-download' && values.out) {
    writeFileSync(values.out, result.bytes, { flag: 'wx', mode: 0o600 });
    return { saved: true, bytes: result.bytes.byteLength };
  }
  return JSON.parse(Buffer.from(result.bytes).toString('utf8'));
}
