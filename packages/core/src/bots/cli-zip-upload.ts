import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import type { BotCreateCliIo, CreateValues } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { connectLiveHost } from './cli-live.js';
import { BOT_ZIP_MAX_BYTES } from './bot-zip.js';
import { validBotCreationKey } from './creation.js';
import { BOT_ZIP_UPLOAD_CHUNK_BYTES, type BotZipUploadStatus } from './zip-upload.js';

export const ZIP_UPLOAD_COMMANDS = [
  'bot-zip-upload',
  'bot-zip-preview',
  'bot-zip-import',
  'bot-zip-import-status',
] as const;
export const ZIP_UPLOAD_OPTIONS = {
  'upload-key': { type: 'string' },
  'archive-sha256': { type: 'string' },
  'archive-size': { type: 'string' },
} as const;

export async function runZipUploadCli(
  command: string,
  rest: string[],
  values: CreateValues & {
    'upload-key'?: string;
    'archive-sha256'?: string;
    'archive-size'?: string;
  },
  io: BotCreateCliIo,
): Promise<unknown> {
  const fail = (message: string): never => {
    throw new CliLiveError('usage', message);
  };
  if (rest.length > 0 || values.home !== undefined)
    fail('Zip transfer commands require an online Host and no positional arguments.');
  const seconds = values.timeout === undefined ? 120 : Number(values.timeout);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 600)
    fail('--timeout must be between 0 and 600 seconds.');
  const lookup = command === 'bot-zip-import-status';
  const uploadKey = values['upload-key'];
  if (!lookup && (!uploadKey || !validBotCreationKey(uploadKey)))
    fail('A valid --upload-key is required.');
  const operationKey = values['operation-key'];
  const mutating = command === 'bot-zip-import';
  if ((lookup || mutating) && (!operationKey || !validBotCreationKey(operationKey)))
    fail('A valid --operation-key is required.');
  if ((lookup || mutating) && !values.name?.trim()) fail('--name is required.');
  let archive: Buffer | undefined;
  let sha256 = values['archive-sha256'];
  let sizeBytes = Number(values['archive-size']);
  if (command === 'bot-zip-upload') {
    if (!values['from-zip']) fail('--from-zip is required.');
    try {
      const file = values['from-zip']!;
      const stat = statSync(file);
      if (!stat.isFile() || stat.size < 22 || stat.size > BOT_ZIP_MAX_BYTES)
        fail('The Zip must be a file of at most 100 MiB.');
      archive = readFileSync(file);
    } catch (error) {
      if (error instanceof CliLiveError) throw error;
      throw new CliLiveError('file-unavailable', 'The Zip file could not be read.');
    }
    sizeBytes = archive.length;
    if (sizeBytes > BOT_ZIP_MAX_BYTES) fail('The Zip must be at most 100 MiB.');
    const digest = createHash('sha256').update(archive).digest('hex');
    if (sha256 !== undefined && sha256 !== digest) fail('The Zip does not match --archive-sha256.');
    sha256 = digest;
  }
  if (!sha256 || !/^[a-f0-9]{64}$/u.test(sha256))
    fail('--archive-sha256 must be a SHA-256 digest.');
  if (
    !lookup &&
    (!Number.isSafeInteger(sizeBytes) || sizeBytes < 22 || sizeBytes > BOT_ZIP_MAX_BYTES)
  )
    fail('--archive-size must be 22–104857600 bytes.');
  const { rpc } = await connectLiveHost(values, io, AbortSignal.timeout(seconds * 1000));
  const identity = { uploadKey, sha256, sizeBytes };
  if (command === 'bot-zip-upload') {
    let status = await rpc<BotZipUploadStatus>('zipUploadBegin', identity);
    const validate = (): void => {
      if (
        status.uploadKey !== uploadKey ||
        status.sha256 !== sha256 ||
        status.sizeBytes !== sizeBytes ||
        status.chunkBytes !== BOT_ZIP_UPLOAD_CHUNK_BYTES ||
        !Number.isSafeInteger(status.offset) ||
        status.offset < 0 ||
        status.offset > sizeBytes ||
        (status.offset !== sizeBytes && status.offset % BOT_ZIP_UPLOAD_CHUNK_BYTES !== 0)
      )
        throw new CliLiveError(
          'host-protocol-error',
          'The Host returned an invalid upload acknowledgement.',
        );
    };
    validate();
    while (status.offset < sizeBytes) {
      const offset = status.offset;
      const next = Math.min(sizeBytes, offset + BOT_ZIP_UPLOAD_CHUNK_BYTES);
      status = await rpc<BotZipUploadStatus>('zipUploadChunk', {
        ...identity,
        offset,
        dataBase64: archive!.subarray(offset, next).toString('base64'),
      });
      validate();
      if (status.offset !== next)
        throw new CliLiveError('host-protocol-error', 'The Host did not acknowledge this chunk.');
    }
    return status;
  }
  if (command === 'bot-zip-preview') return rpc('zipUploadPreview', identity);
  const metadata = {
    operationKey,
    sha256,
    displayName: values.name!.trim(),
    ...(values.description === undefined ? {} : { description: values.description }),
    ...(values.role === undefined ? {} : { roles: values.role }),
  };
  if (lookup) return rpc('zipImportLookup', metadata);
  return rpc('zipImport', { ...identity, ...metadata });
}
