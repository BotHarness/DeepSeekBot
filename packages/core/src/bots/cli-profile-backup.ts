import {
  linkSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import type { connectLiveHost } from './cli-live.js';
import {
  inspectProfileBackup,
  restoreProfileBackup,
  PROFILE_BACKUP_LIMITS,
} from '../portability/package.js';
import { digest, ProfileBackupError } from '../portability/files.js';

const PATH = '/api/botharness/profile-backup';
export const PROFILE_BACKUP_COMMANDS = [
  {
    command: 'profile-backup-preview',
    description: 'preview a complete environment backup on the Host',
  },
  {
    command: 'profile-backup-export',
    description: 'download the preview on stdin with --confirmation-stdin --out <new file>',
  },
  { command: 'profile-backup-inspect', description: 'inspect --file <backup> through the Host' },
  {
    command: 'profile-backup-restore',
    description: 'restore --file <backup> locally into --new-home <new directory> --confirm',
  },
  {
    command: 'profile-backup-recovery',
    description: 'read the restored Profile readiness on the Host',
  },
  {
    command: 'profile-backup-authorize',
    description: 'authorize the restored Bot model: <bot> --confirm',
  },
  {
    command: 'profile-backup-activate',
    description: 'activate a restored Bot: <bot> --confirm --acknowledge-risk',
  },
] as const;
type Command = (typeof PROFILE_BACKUP_COMMANDS)[number]['command'];
export function isProfileBackupCommand(command: string): command is Command {
  return PROFILE_BACKUP_COMMANDS.some((entry) => entry.command === command);
}
type Values = {
  file?: string;
  out?: string;
  'new-home'?: string;
  'confirmation-stdin'?: boolean;
  confirm?: boolean;
  'acknowledge-risk'?: boolean;
  host?: string;
  'token-file'?: string;
};
function usage(message: string): never {
  throw new CliLiveError('usage', message);
}
function readArchive(file: string | undefined): Buffer {
  if (!file) usage('Pass --file <backup>.');
  if (statSync(file).size > PROFILE_BACKUP_LIMITS.maxTotalBytes)
    throw new CliLiveError('too-large', 'Backup exceeds the supported size.');
  return readFileSync(file);
}

export async function runProfileBackupCommand(
  command: Command,
  rest: string[],
  values: Values,
  io: BotCreateCliIo,
  connect: () => ReturnType<typeof connectLiveHost>,
): Promise<unknown> {
  const activation =
    command === 'profile-backup-authorize' || command === 'profile-backup-activate';
  if (rest.length !== (activation ? 1 : 0))
    usage(activation ? 'Pass exactly one Bot id.' : 'This command takes no positional arguments.');
  if ((activation || command === 'profile-backup-restore') && values.confirm !== true)
    usage('Review this operation and pass --confirm.');
  if (command === 'profile-backup-activate' && values['acknowledge-risk'] !== true)
    usage(
      'Resolve possible duplicate execution on the source Profile and pass --acknowledge-risk.',
    );
  try {
    if (command === 'profile-backup-restore') {
      if (!values['new-home']) usage('Pass --new-home <new stopped Profile directory>.');
      if (values.host || values['token-file'])
        usage('Restore is local and offline; omit --host and --token-file.');
      const controller = new AbortController();
      const cancel = () => controller.abort();
      process.once('SIGINT', cancel);
      try {
        const receipt = await restoreProfileBackup(
          readArchive(values.file),
          resolve(values['new-home']),
          { signal: controller.signal },
        );
        return {
          id: receipt.id,
          home: receipt.destinationHome,
          state: 'stopped',
          mode: receipt.mode,
          next: 'Launch the restored Profile with a compatible trusted Tobs installation, review readiness and explicitly activate each Bot.',
        };
      } finally {
        process.removeListener('SIGINT', cancel);
      }
    }
    if (command === 'profile-backup-export') {
      if (!values.out || !values['confirmation-stdin'])
        usage('Pass --out <new file> and pipe the preview JSON using --confirmation-stdin.');
      const parsed = z
        .object({ token: z.string().min(1).max(512) })
        .safeParse(JSON.parse((await io.readStdin?.()) ?? 'null'));
      if (!parsed.success) usage('Stdin must contain the preview JSON and its token.');
      const destination = resolve(values.out);
      if (lstatSync(destination, { throwIfNoEntry: false }))
        throw new CliLiveError('destination-exists', 'Choose a new backup filename.');
      const stage = mkdtempSync(join(dirname(destination), '.backup-download-'));
      try {
        const host = await connect();
        const { bytes, response } = await host.http(PATH, { token: parsed.data.token });
        const archive = Buffer.from(bytes);
        const { manifest } = inspectProfileBackup(archive);
        const sha256 = digest(archive);
        if (sha256 !== response.headers.get('x-backup-sha256'))
          throw new CliLiveError(
            'package-invalid',
            'Downloaded backup did not match the Host checksum.',
          );
        const file = join(stage, 'verified.botharness-backup');
        writeFileSync(file, archive, { flag: 'wx', mode: 0o600 });
        linkSync(file, destination);
        return {
          id: manifest.id,
          file: destination,
          bytes: bytes.length,
          sha256,
          producer: manifest.producer,
        };
      } finally {
        rmSync(stage, { recursive: true, force: true });
      }
    }
    if (command === 'profile-backup-inspect') {
      const archive = readArchive(values.file);
      const host = await connect();
      const response = await host.stream(PATH + '/inspect', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: new Uint8Array(archive),
      });
      return await response.json();
    }
    const host = await connect();
    if (activation) {
      const action = command === 'profile-backup-authorize' ? '/authorize' : '/activate';
      const { bytes } = await host.http(PATH + action, {
        slug: rest[0],
        ...(action === '/activate' ? { acknowledgeSplitBrain: true } : {}),
      });
      return JSON.parse(Buffer.from(bytes).toString('utf8'));
    }
    const { bytes } = await host.http(
      PATH + (command === 'profile-backup-recovery' ? '/recovery' : ''),
    );
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (error) {
    const failure =
      error instanceof CliLiveError
        ? error
        : error instanceof ProfileBackupError
          ? new CliLiveError(error.code, error.message)
          : error instanceof Error && error.name === 'AbortError'
            ? new CliLiveError('cancelled', 'Backup operation was cancelled.')
            : error instanceof Error && 'code' in error && error.code === 'EEXIST'
              ? new CliLiveError('destination-exists', 'Choose a new backup filename or directory.')
              : error instanceof SyntaxError
                ? new CliLiveError('usage', 'Expected valid JSON.')
                : new CliLiveError(
                    'backup-io-failed',
                    'Could not read or save the backup. Check the file and directory access.',
                  );
    failure.operation = command.slice('profile-backup-'.length);
    throw failure;
  }
}
