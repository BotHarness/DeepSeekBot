import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { resolveBotDm } from './cli-bot-dm.js';
import type { BotCreateCliIo } from './bot-create-cli.js';
import { CliLiveError } from './cli-live-error.js';
import { connectLiveHost } from './cli-live-host.js';
import { timeoutMs, usage, type LiveValues } from './cli-live-input.js';

export const MEMORY_COMMANDS = new Set([
  'memory-snapshot',
  'memory-file',
  'memory-image',
  'memory-history',
  'memory-diff',
  'memory-save',
  'memory-file-target',
  'memory-graph',
  'memory-commit-diff',
  'memory-changes',
  'memory-working-diff',
  'memory-checkpoints',
  'memory-restore',
  'memory-restore-commit',
  'memory-versions',
  'memory-version-name',
  'memory-version-unname',
  'memory-repair',
  'memory-move',
]);

const SHA = /^[0-9a-f]{40}$/u;

export async function runMemoryCommand(
  command: string,
  rest: string[],
  values: LiveValues,
  io: BotCreateCliIo,
): Promise<unknown> {
  if (rest.length !== 1 || !rest[0]?.trim()) usage(`${command} needs exactly one bot id.`);
  const slug = rest[0].trim();
  const required = (name: keyof LiveValues, flag: string): string => {
    const value = values[name];
    if (typeof value !== 'string' || !value.trim()) usage(`${command} requires --${flag}.`);
    return value.trim();
  };
  const sha = (): string => {
    const value = required('sha', 'sha <commit>');
    if (!SHA.test(value)) usage('--sha must be a 40-character lowercase commit sha.');
    return value;
  };
  const expectedHead = (): string => {
    const value = required('expected-head', 'expected-head <commit>');
    if (!SHA.test(value)) usage('--expected-head must be a 40-character lowercase commit sha.');
    return value;
  };
  let method: string;
  let args: Record<string, unknown>;
  switch (command) {
    case 'memory-snapshot':
      [method, args] = ['memorySnapshot', {}];
      break;
    case 'memory-image': {
      const path = required('path', 'path <file>');
      const source = required('image-source', 'image-source worktree|index|<commit>');
      const revision = required('image-revision', 'image-revision <sha256>');
      const out = required('out', 'out <absolute file>');
      if (!isAbsolute(out)) usage('--out must be an absolute path.');
      const host = await connectLiveHost(
        values,
        io,
        AbortSignal.timeout(timeoutMs(values.timeout)),
      );
      const reference = values['image-reference'];
      if (values.as !== undefined) {
        const image = await host.rpc<{ mime: string; dataBase64: string }>('memoryImage', {
          slug,
          path,
          source,
          revision,
          ...(reference === undefined ? {} : { reference }),
        });
        const bytes = Buffer.from(image.dataBase64, 'base64');
        writeFileSync(out, bytes, { flag: 'wx' });
        return {
          path,
          source,
          revision,
          ...(reference === undefined ? {} : { reference }),
          mime: image.mime,
          bytes: bytes.length,
          out,
        };
      }
      const { bytes, response } = await host.http(
        '/api/botharness/memory/image?' +
          new URLSearchParams({
            slug,
            path,
            source,
            revision,
            ...(reference === undefined ? {} : { reference }),
          }),
      );
      const mime = response.headers.get('content-type');
      if (
        !['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'].includes(
          mime ?? '',
        )
      )
        throw new CliLiveError('host-protocol-error', 'Expected a supported Memory image');
      writeFileSync(out, bytes, { flag: 'wx' });
      return {
        path,
        source,
        revision,
        ...(reference === undefined ? {} : { reference }),
        mime,
        bytes: bytes.length,
        out,
      };
    }
    case 'memory-file':
      [method, args] = ['memoryFile', { path: required('path', 'path <file>') }];
      break;
    case 'memory-history':
      [method, args] = ['memoryHistory', {}];
      break;
    case 'memory-diff':
      [method, args] = ['memoryDiff', { sha: sha() }];
      break;
    case 'memory-file-target':
      [method, args] = ['memoryFileTarget', { slug, path: required('path', 'path <file>') }];
      break;
    case 'memory-graph': {
      const offset = values.offset === undefined ? 0 : Number(values.offset);
      if (!Number.isInteger(offset) || offset < 0 || offset > 10_000)
        usage('--offset must be an integer from 0 to 10000.');
      [method, args] = [
        'memoryGitGraph',
        {
          offset,
          ...(values.path === undefined ? {} : { path: required('path', 'path <file>') }),
        },
      ];
      break;
    }
    case 'memory-commit-diff':
      [method, args] = ['memoryGitCommitDiff', { sha: sha() }];
      break;
    case 'memory-changes':
      [method, args] = ['memoryWorkingChanges', {}];
      break;
    case 'memory-working-diff': {
      const kind = required('kind', 'kind staged|unstaged|untracked|current');
      if (!['staged', 'unstaged', 'untracked', 'current'].includes(kind))
        usage('--kind must be staged, unstaged, untracked or current.');
      [method, args] = ['memoryWorkingDiff', { path: required('path', 'path <file>'), kind }];
      break;
    }
    case 'memory-checkpoints':
      [method, args] = ['memoryRecoveryHistory', {}];
      break;
    case 'memory-restore':
      [method, args] = [
        'memoryRestore',
        {
          checkpointId: required('checkpoint', 'checkpoint <id>'),
          expectedCurrentId: required('expected-current', 'expected-current <id>'),
        },
      ];
      break;
    case 'memory-restore-commit':
      [method, args] = [
        'memoryRestoreCommit',
        {
          sha: sha(),
          expectedHead: expectedHead(),
          restoreId: values['restore-id']?.trim() || randomUUID(),
          ...(values.name === undefined ? {} : { name: values.name }),
        },
      ];
      break;
    case 'memory-versions':
      [method, args] = ['memoryVersions', {}];
      break;
    case 'memory-version-name':
      [method, args] = [
        'memoryNameVersion',
        { sha: sha(), name: required('name', 'name <version>') },
      ];
      break;
    case 'memory-version-unname':
      [method, args] = ['memoryRemoveVersionName', { tag: required('tag', 'tag <version>') }];
      break;
    case 'memory-move': {
      const location = values['memory-location']?.trim();
      if ((location === undefined || location === '') === (values['default-location'] !== true))
        usage(
          'memory-move needs --memory-location <absolute-dir> or --default-location, not both.',
        );
      if (location !== undefined && location !== '' && !isAbsolute(location))
        usage('--memory-location must be an absolute folder path.');
      [method, args] = [
        'memoryMove',
        {
          slug,
          location: location === undefined || location === '' ? null : location,
        },
      ];
      break;
    }
    case 'memory-repair':
      [method, args] = [
        'memoryRepair',
        {
          expectedHead: expectedHead(),
          repairId: values['repair-id']?.trim() || randomUUID(),
        },
      ];
      break;
    default: {
      const path = required('path', 'path <file>');
      const head = expectedHead();
      let body = values.body;
      if (values['body-stdin'] === true) body = await (io.readStdin?.() ?? Promise.resolve(''));
      if (body === undefined) usage('memory-save needs --body or --body-stdin.');
      [method, args] = [
        'memorySave',
        {
          path,
          body,
          expectedHead: head,
          editId: values['edit-id']?.trim() || randomUUID(),
        },
      ];
    }
  }
  const signal = AbortSignal.timeout(timeoutMs(values.timeout));
  const rpc = (await connectLiveHost(values, io, signal)).rpc;
  return rpc(
    method,
    method === 'memoryMove' || method === 'memoryFileTarget'
      ? args
      : { ...args, channelId: await resolveBotDm(rpc, slug) },
  );
}
