import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isUploadPath,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILES,
  uploadFileKind,
} from '../../../market/src/upload-files.js';
import { listBotFiles } from '../bots/bot-zip.js';
import type { ShareDrafts } from './share-draft.js';
import { parseMemoryGitUrl } from '../memory/clone.js';
import type { BotImportInput } from '../bots/creation.js';
import type { ZipEntry } from '../bots/zip-archive.js';
import type { MarketplaceLanguage } from './language.js';
import type {
  MarketplaceAuthoredBot,
  MarketplaceAuthorAccount,
  MarketplaceClient,
  MarketplaceEntry,
  MarketplaceFile,
  MarketplaceResult,
} from './client.js';

export type UploadSkipReason = 'file-type-refused' | 'file-too-large' | 'invalid-path';

export interface UploadPlan {
  files: MarketplaceFile[];
  skipped: Array<{ path: string; reason: UploadSkipReason }>;
  totalBytes: number;
}

export interface MarketplaceAccount {
  signedIn: boolean;
  email?: string;
  author: MarketplaceAuthorAccount | null;
}

export interface UploadPresentation {
  displayName: string;
  bio?: string;
  tags?: string[];
  replaces?: string;
}

type Refusal = { ok: false; code: string; path?: string };
type Result<T> = { ok: true; value: T } | Refusal;

const FETCH_CONCURRENCY = 6;

export function planUpload(memoryDir: string): UploadPlan {
  const files: MarketplaceFile[] = [];
  const skipped: UploadPlan['skipped'] = [];
  let totalBytes = 0;
  for (const path of listBotFiles(memoryDir)) {
    const kind = uploadFileKind(path);
    if (!isUploadPath(path)) {
      skipped.push({ path, reason: 'invalid-path' });
      continue;
    }
    if (kind === undefined) {
      skipped.push({ path, reason: 'file-type-refused' });
      continue;
    }
    let size: number;
    try {
      size = lstatSync(join(memoryDir, path)).size;
    } catch {
      continue;
    }
    if (size > MAX_UPLOAD_FILE_BYTES) {
      skipped.push({ path, reason: 'file-too-large' });
      continue;
    }
    totalBytes += size;
    files.push({ path, size, kind });
  }
  return { files, skipped, totalBytes };
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function uploadedFilesDigest(files: readonly ZipEntry[]): string {
  const canonical = [...files]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((file) => [file.path, digest(file.data)]);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export function createMarketplaceUploads(deps: {
  client: MarketplaceClient;
  account: () =>
    | {
        status(): { state: string; email?: string };
        accessToken(options?: { fresh?: boolean }): Promise<string | undefined>;
      }
    | undefined;
  drafts: ShareDrafts;
  log?: (event: Record<string, string | number>) => void;
}) {
  const { client } = deps;

  const report = (phase: string, started: number, outcome: string, extra = {}) => {
    try {
      deps.log?.({
        module: 'marketplace-upload',
        phase,
        outcome,
        durationMs: Math.round(performance.now() - started),
        ...extra,
      });
    } catch {}
  };

  const signed = async <T>(
    call: (token: string) => Promise<MarketplaceResult<T>>,
  ): Promise<Result<T>> => {
    const account = deps.account();
    if (account?.status().state !== 'signed-in') return { ok: false, code: 'sign-in-required' };
    const token = await account.accessToken();
    if (token === undefined) return { ok: false, code: 'sign-in-required' };
    const first = await call(token);
    if (first.ok || first.code !== 'unauthorized') return first;
    const fresh = await account.accessToken({ fresh: true });
    if (fresh === undefined) return { ok: false, code: 'sign-in-required' };
    const second = await call(fresh);
    return !second.ok && second.code === 'unauthorized'
      ? { ok: false, code: 'sign-in-required' }
      : second;
  };

  return {
    async account(): Promise<Result<MarketplaceAccount>> {
      const account = deps.account();
      const status = account?.status();
      if (status?.state !== 'signed-in')
        return { ok: true, value: { signedIn: false, author: null } };
      const author = await signed((token) => client.author(token));
      if (!author.ok) {
        return author.code === 'sign-in-required'
          ? { ok: true, value: { signedIn: false, author: null } }
          : author;
      }
      return {
        ok: true,
        value: {
          signedIn: true,
          ...(status.email === undefined ? {} : { email: status.email }),
          author: author.value,
        },
      };
    },

    saveAuthor(input: { displayName: string; acceptTerms: boolean }) {
      return signed((token) => client.saveAuthor(token, input));
    },

    saveAuthorAvatar(avatar: Uint8Array | null) {
      return signed((token) => client.saveAuthorAvatar(token, avatar));
    },

    mine(lang?: MarketplaceLanguage): Promise<Result<MarketplaceAuthoredBot[]>> {
      return signed((token) => client.authored(token, lang));
    },

    async remove(id: string): Promise<Result<{ deleted: true }>> {
      const started = performance.now();
      const removed = await signed((token) => client.deleteUpload(token, id));
      report(
        'delete',
        started,
        removed.ok ? 'ok' : 'refused',
        removed.ok ? {} : { reason: removed.code },
      );
      return removed;
    },

    plan(slug: string): Result<UploadPlan> {
      const source = deps.drafts.source(slug);
      return source.ok ? { ok: true, value: source.value.plan } : source;
    },

    async upload(
      slug: string,
      presentation: UploadPresentation,
    ): Promise<Result<{ bot: MarketplaceEntry; skipped: UploadPlan['skipped'] }>> {
      const started = performance.now();
      const source = deps.drafts.source(slug);
      if (!source.ok) return source;
      const { dir, plan } = source.value;
      if (plan.files.length === 0) return { ok: false, code: 'nothing-to-upload' };
      if (plan.files.length > MAX_UPLOAD_FILES) return { ok: false, code: 'too-many-files' };
      if (plan.totalBytes > MAX_UPLOAD_BYTES) return { ok: false, code: 'too-large' };
      const contents = new Map<string, Buffer>();
      try {
        for (const file of plan.files) contents.set(file.path, readFileSync(join(dir, file.path)));
      } catch {
        return { ok: false, code: 'share-draft-unreadable' };
      }
      const begun = await signed((token) =>
        client.beginUpload(token, {
          ...presentation,
          files: plan.files.map((file) => {
            const bytes = contents.get(file.path)!;
            return { path: file.path, size: bytes.byteLength, sha256: digest(bytes) };
          }),
        }),
      );
      if (!begun.ok) {
        report('upload', started, 'refused', { reason: begun.code });
        return begun;
      }
      for (const [path, bytes] of contents) {
        const put = await signed((token) =>
          client.putUploadFile(token, begun.value.id, path, bytes),
        );
        if (!put.ok) {
          report('upload', started, 'refused', { reason: put.code });
          return put;
        }
      }
      const published = await signed((token) => client.publishUpload(token, begun.value.id));
      if (!published.ok) {
        report('upload', started, 'refused', { reason: published.code });
        return published;
      }
      report('upload', started, 'ok', {
        files: plan.files.length,
        bytes: plan.totalBytes,
        ...(presentation.replaces === undefined ? {} : { replaced: 1 }),
      });
      return { ok: true, value: { bot: published.value, skipped: plan.skipped } };
    },

    async installInput(
      id: string,
    ): Promise<Result<{ entry: MarketplaceEntry; input: BotImportInput }>> {
      const started = performance.now();
      const detail = await client.detail(id);
      if (!detail.ok) return detail;
      const { bot } = detail.value;
      const presentation = {
        displayName: bot.displayName ?? bot.name,
        ...(bot.description === null ? {} : { description: bot.description }),
        ...(bot.roles.length === 0 ? {} : { roles: bot.roles }),
      };
      if (bot.source === 'github') {
        const gitUrl = parseMemoryGitUrl(bot.cloneUrl);
        if (gitUrl === undefined || bot.headCommit === null)
          return { ok: false, code: 'listing-not-installable' };
        return {
          ok: true,
          value: {
            entry: bot,
            input: { ...presentation, source: { kind: 'git', gitUrl, commit: bot.headCommit.sha } },
          },
        };
      }
      if (detail.value.files === undefined) return { ok: false, code: 'listing-not-installable' };
      const listed = detail.value.files;
      if (listed.length === 0) return { ok: false, code: 'nothing-to-install' };
      const files: ZipEntry[] = [];
      let failure: Refusal | undefined;
      let next = 0;
      const worker = async () => {
        while (failure === undefined && next < listed.length) {
          const file = listed[next++]!;
          if (!isUploadPath(file.path)) {
            failure = { ok: false, code: 'invalid-path', path: file.path };
            return;
          }
          const fetched = await client.file(bot.id, file.path);
          if (!fetched.ok) {
            failure = { ...fetched, path: file.path };
            return;
          }
          if (fetched.value.byteLength !== file.size) {
            failure = { ok: false, code: 'file-mismatch', path: file.path };
            return;
          }
          files.push({ path: file.path, data: Buffer.from(fetched.value) });
        }
      };
      await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, worker));
      if (failure !== undefined) {
        report('install-download', started, 'refused', { reason: (failure as Refusal).code });
        return failure;
      }
      report('install-download', started, 'ok', { files: files.length });
      return {
        ok: true,
        value: {
          entry: bot,
          input: {
            ...presentation,
            source: { kind: 'archive', sha256: uploadedFilesDigest(files), files },
          },
        },
      };
    },
  };
}

export type MarketplaceUploads = ReturnType<typeof createMarketplaceUploads>;
