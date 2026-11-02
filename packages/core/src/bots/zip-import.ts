import { parseBotDescriptor } from '../marketplace/descriptor.js';
import { BotCreationError, type BotCreationResult, type BotImportReference } from './creation.js';
import type { BotImportsService } from './imports.js';
import type { PersonaBotRegistry } from './registry.js';
import type { BotZipUploadIdentity, BotZipUploads } from './zip-upload.js';
import { BotZipUploadError } from './zip-upload.js';
import { ZipArchiveError } from './zip-archive.js';

export interface BotZipImportReference {
  operationKey: string;
  sha256: string;
  displayName: string;
  description?: string;
  roles?: string[];
}

export interface BotZipImportInput extends BotZipImportReference, BotZipUploadIdentity {}

export interface BotZipPreview {
  source: { kind: 'archive'; sha256: string };
  descriptor: { displayName: string; description?: string; roles?: string[] };
  fileCount: number;
  expandedBytes: number;
  history: boolean;
}

function reference(input: BotZipImportReference): BotImportReference {
  const descriptor = parseBotDescriptor(
    JSON.stringify({ name: input.displayName, bio: input.description, tags: input.roles }),
  );
  if (
    descriptor?.name === undefined ||
    typeof input.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(input.sha256)
  )
    throw new BotCreationError('invalid-input', 'A name and archive digest are required.');
  return {
    displayName: descriptor.name,
    ...(input.description === undefined ? {} : { description: descriptor.bio ?? '' }),
    ...(input.roles === undefined ? {} : { roles: descriptor.tags ?? [] }),
    source: { kind: 'archive', sha256: input.sha256 },
  };
}

export function createBotZipImport(options: {
  uploads: BotZipUploads;
  imports: BotImportsService;
  registry: PersonaBotRegistry;
  log?: (event: Record<string, string | number>) => void;
}) {
  const { uploads, imports, registry } = options;
  const report = (phase: string, started: number, error?: unknown): void => {
    try {
      options.log?.({
        event: 'bot-zip',
        initiator: 'host-client',
        phase,
        outcome: error === undefined ? 'ok' : 'refused',
        durationMs: Math.round(performance.now() - started),
        ...(error === undefined
          ? {}
          : {
              reason:
                error instanceof BotCreationError ||
                error instanceof BotZipUploadError ||
                error instanceof ZipArchiveError
                  ? error.code
                  : 'unavailable',
            }),
      });
    } catch {}
  };
  const observed = <T>(phase: string, run: () => T): T => {
    const started = performance.now();
    try {
      const value = run();
      report(phase, started);
      return value;
    } catch (error) {
      report(phase, started, error);
      throw error;
    }
  };
  return {
    begin: (input: BotZipUploadIdentity) => observed('upload-begin', () => uploads.begin(input)),
    chunk(input: BotZipUploadIdentity & { offset: number; dataBase64: string }) {
      const started = performance.now();
      try {
        const result = uploads.chunk(input);
        if (result.offset === result.sizeBytes) report('upload-complete', started);
        return result;
      } catch (error) {
        report('upload', started, error);
        throw error;
      }
    },
    preview(input: BotZipUploadIdentity): BotZipPreview {
      return observed('preview', () => {
        const preview = imports.previewArchive(uploads.read(input));
        return {
          source: preview.source,
          descriptor: {
            displayName: preview.descriptor?.name ?? 'Bot',
            ...(preview.descriptor?.bio === undefined
              ? {}
              : { description: preview.descriptor.bio }),
            ...(preview.descriptor?.tags === undefined ? {} : { roles: preview.descriptor.tags }),
          },
          fileCount: preview.files.length,
          expandedBytes: preview.files.reduce((total, file) => total + file.size, 0),
          history: preview.history,
        };
      });
    },
    lookup(input: BotZipImportReference) {
      return imports.lookup(input.operationKey, reference(input));
    },
    async create(input: BotZipImportInput, authorize?: () => void): Promise<BotCreationResult> {
      const started = performance.now();
      try {
        authorize?.();
        const accepted = reference(input);
        const receipt = imports.lookup(input.operationKey, accepted);
        if (receipt?.status === 'created' && receipt.channelId !== undefined) {
          const record = registry.get(receipt.botSlug);
          if (record === undefined)
            throw new BotCreationError(
              'creation-identity-unavailable',
              'The original Bot is no longer available.',
            );
          report('import-recovered', started);
          return { record, receipt, channelId: receipt.channelId };
        }
        const archive = uploads.read(input);
        const parsed = imports.archiveInput(archive, {
          expectedArchive: input.sha256,
          displayName: accepted.displayName,
        });
        const created = await imports.create(
          input.operationKey,
          { ...accepted, source: parsed.source },
          authorize,
        );
        report('import', started);
        return created;
      } catch (error) {
        report('import', started, error);
        throw error;
      }
    },
  };
}

export type BotZipImportService = ReturnType<typeof createBotZipImport>;
