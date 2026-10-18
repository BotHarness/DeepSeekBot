import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { parseCloudManagement } from '../cloud/management.js';
import { parseCloudWork } from '../cloud/work.js';
export async function prepareCloudWork(
  rest: string[],
  values: { 'input-stdin'?: boolean },
  io: BotCreateCliIo,
) {
  if (rest.length !== 1 || !rest[0]?.trim() || !values['input-stdin'] || !io.readStdin)
    throw new CliLiveError('usage', 'Use cloud-work <bot> --input-stdin.');
  try {
    const text = await io.readStdin();
    if (Buffer.byteLength(text) > 2000) throw Error();
    return { slug: rest[0].trim(), input: parseCloudWork(JSON.parse(text)) };
  } catch {
    throw new CliLiveError(
      'invalid-cloud-work',
      'Cloud work requires an operation and canonical source_event_id.',
    );
  }
}
export async function prepareCloud(
  rest: string[],
  values: { 'input-stdin'?: boolean; confirm?: boolean },
  io: BotCreateCliIo,
) {
  const [operation] = rest;
  if (rest.length !== 1 || !['list', 'import', 'policy', 'remove'].includes(operation ?? ''))
    throw new CliLiveError('usage', 'Use cloud list, import, policy or remove.');
  if (operation === 'list') {
    if (values['input-stdin']) throw new CliLiveError('usage', 'cloud list does not accept input.');
    return parseCloudManagement({ operation });
  }
  if (!values['input-stdin'] || !io.readStdin)
    throw new CliLiveError(
      'usage',
      'Use --input-stdin with private JSON input; never pass credentials as arguments.',
    );
  if (operation === 'remove' && !values.confirm)
    throw new CliLiveError('usage', 'cloud remove requires --confirm.');
  try {
    const text = await io.readStdin();
    if (Buffer.byteLength(text) > 20000) throw Error();
    const input: unknown = JSON.parse(text);
    if (operation === 'import') return parseCloudManagement({ operation, credential: input });
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.hasOwn(input, 'operation') ||
      Object.hasOwn(input, 'confirm')
    )
      throw Error();
    return parseCloudManagement({
      ...input,
      operation,
      ...(operation === 'remove' ? { confirm: true } : {}),
    });
  } catch {
    throw new CliLiveError(
      'invalid-cloud-input',
      'Cloud input is invalid; no credential values are included in this error.',
    );
  }
}
