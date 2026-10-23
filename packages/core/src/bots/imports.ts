import { createHash } from 'node:crypto';
import { parseMemoryGitUrl, previewMemoryRepository } from '../memory/clone.js';
import { BOT_ZIP_MAX_BYTES, readBotZip } from './bot-zip.js';
import type { BotCreationService, BotImportInput, BotImportReference } from './creation.js';
import { BotCreationError } from './creation.js';

export function createBotImports(
  creations: BotCreationService,
  options: { previewGit?: typeof previewMemoryRepository; log?: (message: string) => void } = {},
) {
  const previewGit = async (gitUrl: string) => {
    const result = await (options.previewGit ?? previewMemoryRepository)({
      url: gitUrl,
      ...(options.log === undefined ? {} : { log: options.log }),
    });
    if (!result.ok)
      throw new BotCreationError(result.code, 'The repository could not be inspected.');
    return {
      source: {
        kind: 'git' as const,
        gitUrl: result.gitUrl,
        commit: result.commit,
        ...(result.httpsFallback === undefined ? {} : { httpsFallback: result.httpsFallback }),
      },
    };
  };
  const previewArchive = (archive: Buffer) => {
    if (archive.length > BOT_ZIP_MAX_BYTES)
      throw new BotCreationError('too-large', 'Archive exceeds the import limit.');
    const contents = readBotZip(archive);
    return {
      source: {
        kind: 'archive' as const,
        sha256: createHash('sha256').update(archive).digest('hex'),
      },
      ...(contents.descriptor === undefined ? {} : { descriptor: contents.descriptor }),
      files: contents.files.map((file) => ({ path: file.path, size: file.data.length })),
      history: contents.history !== undefined,
    };
  };
  const gitInput = (input: {
    gitUrl: string;
    expectedCommit: string;
    displayName: string;
    description?: string;
    roles?: string[];
  }): BotImportInput => {
    const gitUrl = parseMemoryGitUrl(input.gitUrl);
    if (!gitUrl || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(input.expectedCommit))
      throw new BotCreationError(
        'unsupported-source',
        'A valid Git source and observed immutable commit are required.',
      );
    return {
      displayName: input.displayName,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.roles === undefined ? {} : { roles: input.roles }),
      source: { kind: 'git', gitUrl, commit: input.expectedCommit },
    };
  };
  const archiveInput = (
    archive: Buffer,
    input: {
      expectedArchive: string;
      displayName?: string;
      description?: string;
      roles?: string[];
    },
  ): BotImportInput => {
    const preview = previewArchive(archive);
    if (preview.source.sha256 !== input.expectedArchive)
      throw new BotCreationError(
        'stale-import-source',
        'Archive bytes changed after source inspection.',
      );
    const contents = readBotZip(archive);
    const description = input.description ?? contents.descriptor?.bio;
    const roles = input.roles ?? contents.descriptor?.tags;
    return {
      displayName: input.displayName ?? contents.descriptor?.name ?? 'Bot',
      ...(description === undefined ? {} : { description }),
      ...(roles === undefined ? {} : { roles }),
      source: {
        kind: 'archive',
        sha256: preview.source.sha256,
        files: contents.files,
        ...(contents.history === undefined ? {} : { history: contents.history }),
      },
    };
  };
  return {
    previewGit,
    previewArchive,
    gitInput,
    archiveInput,
    lookup: (key: string, input: BotImportReference) => creations.lookupImport(key, input),
    create: (key: string, input: BotImportInput, authorize?: () => void) =>
      creations.importBot(input, key, authorize),
  };
}
export type BotImportsService = ReturnType<typeof createBotImports>;
