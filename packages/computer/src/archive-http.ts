import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ComputerService } from './service.js';
import type { ComputerTarget } from './target.js';
import type { createTransferTokens } from './transfer-tokens.js';

export function isSafeArchiveName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*\.tar$/u.test(name) && !name.includes('..');
}

export async function streamArchiveResponse(archivePath: string): Promise<Response> {
  const info = await stat(archivePath);
  const body = Readable.toWeb(createReadStream(archivePath));
  return new Response(body as BodyInit, {
    status: 200,
    headers: {
      'content-type': 'application/x-tar',
      'content-disposition': `attachment; filename="${basename(archivePath)}"`,
      'content-length': String(info.size),
    },
  });
}

export async function receiveUploadBody(
  body: ReadableStream<Uint8Array> | null,
  destPath: string,
): Promise<void> {
  if (body === null) throw new Error('empty upload body');
  const out = createWriteStream(destPath);
  try {
    await pipeline(body, out);
  } catch (error) {
    await rm(destPath, { force: true });
    throw error;
  }
}

export async function storeUploadBody(
  body: ReadableStream<Uint8Array> | null,
  destPath: string,
): Promise<void> {
  const tmp = `${destPath}.part`;
  await receiveUploadBody(body, tmp);
  await rename(tmp, destPath);
}

export function defaultExportDir(home = homedir()): string {
  const desktop = join(home, 'Desktop');
  return existsSync(desktop)
    ? join(desktop, 'BotHarness Exports')
    : join(home, 'BotHarness Exports');
}

interface ArchiveOptions {
  json(value: unknown, status?: number): Response;
  parseBody(request: Request): Promise<Record<string, unknown>>;
  unauthorized(): Response;
  target(): ComputerTarget;
  resolveExportDir(): string;
  service: ComputerService;
  transferTokens(): ReturnType<typeof createTransferTokens>;
  log(message: string): void;
}

export function createArchiveHandlers({
  json,
  parseBody,
  unauthorized,
  target,
  resolveExportDir,
  service,
  transferTokens,
  log,
}: ArchiveOptions) {
  const unknownToken = (kind: string): Response =>
    json({ ok: false, code: 'unknown-token', error: `unknown or expired ${kind} token` }, 404);

  return {
    exportArchive: async (request: Request): Promise<Response> => {
      if (target() !== 'container')
        return json(
          {
            ok: false,
            code: 'container-only',
            error: 'Archive transfer is only available for Container Computer',
          },
          400,
        );
      const body = await parseBody(request);
      if (body.authorize !== true) return unauthorized();
      const requested = typeof body.dir === 'string' && body.dir !== '' ? body.dir : undefined;
      if (requested !== undefined && !isAbsolute(requested)) {
        return json({ ok: false, code: 'dir-invalid', error: 'dir must be absolute' }, 400);
      }
      const exportDir = requested ?? resolveExportDir();
      log(`export requested (panel)${requested === undefined ? '' : ` → ${requested}`}`);
      try {
        await mkdir(exportDir, { recursive: true });
        const archive = await service.exportTo(exportDir);
        return json({
          ok: true,
          archive,
          downloadToken: transferTokens().mint(archive, 'download'),
        });
      } catch (error) {
        return json({ ok: false, error: String(error) }, 500);
      }
    },
    openDirectory: async (request: Request): Promise<Response> => {
      if (target() !== 'container')
        return json(
          {
            ok: false,
            code: 'container-only',
            error: 'Archive transfer is only available for Container Computer',
          },
          400,
        );
      const body = await parseBody(request);
      if (body.authorize !== true) return unauthorized();
      const requested = typeof body.dir === 'string' && body.dir !== '' ? body.dir : undefined;
      if (requested !== undefined && !isAbsolute(requested)) {
        return json({ ok: false, code: 'dir-invalid', error: 'dir must be absolute' }, 400);
      }
      const dir = requested ?? resolveExportDir();
      const opener =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'explorer'
            : 'xdg-open';
      try {
        await mkdir(dir, { recursive: true });
        const child = spawn(opener, [dir], {
          windowsHide: false,
          detached: true,
          stdio: 'ignore',
          shell: false,
        });
        await new Promise<void>((resolve, reject) => {
          child.once('spawn', () => {
            child.unref();
            resolve();
          });
          child.once('error', reject);
        });
        log(`opened directory (${dir})`);
        return json({ ok: true });
      } catch (error) {
        return json({ ok: false, error: String(error) }, 500);
      }
    },
    listArchives: async (): Promise<Response> => {
      if (target() !== 'container')
        return json(
          {
            ok: false,
            code: 'container-only',
            error: 'Archive transfer is only available for Container Computer',
          },
          400,
        );
      const exportDir = resolveExportDir();
      try {
        const entries = await readdir(exportDir);
        return json({ ok: true, files: entries.filter(isSafeArchiveName).sort() });
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') {
          return json({ ok: true, files: [] });
        }
        return json({ ok: false, error: String(error) }, 500);
      }
    },
    importArchive: async (request: Request): Promise<Response> => {
      if (target() !== 'container')
        return json(
          {
            ok: false,
            code: 'container-only',
            error: 'Archive transfer is only available for Container Computer',
          },
          400,
        );
      const body = await parseBody(request);
      if (body.authorize !== true) return unauthorized();
      const exportDir = resolveExportDir();
      const file = typeof body.file === 'string' ? body.file : '';
      if (!isSafeArchiveName(file)) {
        return json({ ok: false, code: 'invalid-archive', error: 'invalid archive name' }, 400);
      }
      log(`import requested (panel): ${file}`);
      try {
        await service.importFrom(join(exportDir, file));
        return json({ ok: true });
      } catch (error) {
        return json({ ok: false, error: String(error) }, 500);
      }
    },
    download: async (request: Request): Promise<Response> => {
      if (target() !== 'container')
        return json(
          {
            ok: false,
            code: 'container-only',
            error: 'Archive transfer is only available for Container Computer',
          },
          400,
        );
      const token = new URL(request.url).searchParams.get('token') ?? '';
      const archive = transferTokens().consume(token, 'download');
      if (archive === undefined) return unknownToken('download');
      try {
        log(`download requested (panel): ${basename(archive)}`);
        return await streamArchiveResponse(archive);
      } catch {
        return json(
          { ok: false, code: 'archive-missing', error: 'archive is no longer available' },
          404,
        );
      }
    },
    upload: async (request: Request): Promise<Response> => {
      if (target() !== 'container')
        return json(
          {
            ok: false,
            code: 'container-only',
            error: 'Archive transfer is only available for Container Computer',
          },
          400,
        );
      const body = await parseBody(request);
      if (body.authorize !== true) return unauthorized();
      const file = typeof body.file === 'string' ? body.file : '';
      if (!isSafeArchiveName(file)) {
        return json({ ok: false, code: 'invalid-archive', error: 'invalid archive name' }, 400);
      }
      const exportDir = resolveExportDir();
      try {
        await mkdir(exportDir, { recursive: true });
        const uploadToken = transferTokens().mint(join(exportDir, file), 'upload');
        log(`upload requested (panel): ${file}`);
        return json({ ok: true, uploadToken });
      } catch (error) {
        return json({ ok: false, error: String(error) }, 500);
      }
    },
    uploadContent: async (request: Request): Promise<Response> => {
      if (target() !== 'container')
        return json(
          {
            ok: false,
            code: 'container-only',
            error: 'Archive transfer is only available for Container Computer',
          },
          400,
        );
      const token = new URL(request.url).searchParams.get('token') ?? '';
      const dest = transferTokens().consume(token, 'upload');
      if (dest === undefined) return unknownToken('upload');
      log(
        `upload streaming in (panel): ${request.method} ` +
          `content-type=${request.headers.get('content-type') ?? '?'} ` +
          `length=${request.headers.get('content-length') ?? '?'} ` +
          `encoding=${request.headers.get('transfer-encoding') ?? 'identity'}`,
      );
      try {
        await storeUploadBody(request.body, dest);
      } catch (error) {
        return json({ ok: false, error: String(error) }, 500);
      }
      log(`upload received (panel): ${basename(dest)}`);
      return json({ ok: true });
    },
  };
}
