import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import { genuiReplySchema, genuiViewSchema } from '../channels/genui.js';
import { genuiDocumentReplySchema, genuiDocumentStateSchema } from '../channels/genui-document.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';

export const GENUI_OPTIONS = {
  'genui-file': { type: 'string' },
  'genui-stdin': { type: 'boolean' },
} as const;
export const GENUI_COMMANDS = [
  { command: 'genui-view', description: 'read your private GenUI view from the live Host' },
  {
    command: 'genui-view-save',
    description: 'save a bounded GenUI view with its expected version',
  },
  {
    command: 'genui-submit',
    description: 'submit GenUI context as an ordinary Human Channel message',
  },
] as const;

export async function runGenuiCommand(
  command: string,
  rest: string[],
  values: { 'genui-file'?: string; 'genui-stdin'?: boolean; 'message-id'?: string },
  io: BotCreateCliIo,
  connect: () => Promise<{
    rpc(method: string, payload: Record<string, unknown>): Promise<unknown>;
  }>,
): Promise<unknown> {
  const channelId = rest[0];
  const messageId = values['message-id'];
  if (rest.length !== 1 || !channelId?.trim() || !messageId?.trim())
    throw new CliLiveError('usage', 'Provide a Channel id and --message-id.');
  if (command === 'genui-view') {
    if (values['genui-file'] !== undefined || values['genui-stdin'])
      throw new CliLiveError('usage', 'genui-view does not accept an input document.');
    return (await connect()).rpc('channelGenuiView', { channelId, messageId });
  }
  if ((values['genui-file'] !== undefined) === (values['genui-stdin'] === true))
    throw new CliLiveError('usage', 'Choose exactly one of --genui-file or --genui-stdin.');
  let input: unknown;
  try {
    const file = values['genui-file'];
    if (file !== undefined && statSync(file).size > 32_768) throw new Error('Input too large');
    const text =
      file === undefined
        ? await (io.readStdin?.() ?? Promise.resolve(''))
        : readFileSync(file, 'utf8');
    if (Buffer.byteLength(text, 'utf8') > 32_768) throw new Error('Input too large');
    input = JSON.parse(text);
  } catch {
    throw new CliLiveError(
      'invalid-genui-input',
      'Expected a JSON input document of at most 32 KiB.',
    );
  }
  if (command === 'genui-view-save') {
    const parsed = z
      .strictObject({
        snapshotId: z.string().min(1).max(100),
        expectedVersion: z
          .number()
          .int()
          .nonnegative()
          .max(Number.MAX_SAFE_INTEGER - 1),
        state: z.union([genuiViewSchema, genuiDocumentStateSchema]),
      })
      .safeParse(input);
    if (!parsed.success)
      throw new CliLiveError(
        'invalid-genui-input',
        'Expected snapshotId, expectedVersion and a bounded view state.',
      );
    return (await connect()).rpc('channelGenuiViewSave', { channelId, messageId, ...parsed.data });
  }
  if (!/^human-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(messageId))
    throw new CliLiveError(
      'usage',
      'genui-submit requires a stable --message-id human-UUID for safe retries.',
    );
  const parsed = z
    .strictObject({
      body: z.string().trim().min(1).max(2000),
      genuiReply: z.union([genuiReplySchema, genuiDocumentReplySchema]),
    })
    .safeParse(input);
  if (!parsed.success)
    throw new CliLiveError(
      'invalid-genui-input',
      'Expected a request body and exact genuiReply references.',
    );
  return (await connect()).rpc('channelSend', { channelId, messageId, ...parsed.data });
}
