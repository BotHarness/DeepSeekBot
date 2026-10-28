import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import {
  isUploadPath,
  MAX_UPLOAD_FILE_BYTES,
  type UploadFileKind,
} from '../../../market/src/upload-files.js';
import { planUpload, type UploadPlan } from './uploaded-bots.js';

export type ShareDraftFileStatus = 'pending' | 'kept' | 'rewritten' | 'dropped';
export type ShareDraftFlag = 'secret' | 'email' | 'phone' | 'url-credential' | 'private-key';

export interface ShareDraftFile {
  path: string;
  size: number;
  kind: UploadFileKind;
  status: ShareDraftFileStatus;
  flags: ShareDraftFlag[];
}

export interface ShareDraft {
  slug: string;
  id: string;
  state: 'reviewing' | 'ready';
  createdAt: string;
  updatedAt: string;
  files: ShareDraftFile[];
  skipped: UploadPlan['skipped'];
}

export interface ShareDraftSummary {
  slug: string;
  id: string;
  state: ShareDraft['state'];
  total: number;
  pending: number;
  kept: number;
  rewritten: number;
  dropped: number;
  flagged: number;
  updatedAt: string;
}

export type ShareDraftView = ShareDraft & { summary: ShareDraftSummary };

export type ShareDraftDecision = { keep: true } | { drop: true } | { rewrite: string };

type Refusal = { ok: false; code: string; path?: string };
type Result<T> = { ok: true; value: T } | Refusal;

const MANIFEST = 'draft.json';
const FILES = 'files';
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

const DETECTORS: ReadonlyArray<[ShareDraftFlag, RegExp]> = [
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
  [
    'secret',
    /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b|\b(?:api[_-]?key|secret|token|password|passwd|密码|口令)\s*[:=：]\s*\S{6,}/iu,
  ],
  ['url-credential', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/iu],
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/u],
  [
    'phone',
    /(?<![\d-])(?:\+?\d{1,3}[ -]?)?(?:1[3-9]\d{9}|\(?\d{3}\)?[ -]\d{3,4}[ -]\d{4})(?![\d-])/u,
  ],
];

export function shareDraftFlags(text: string): ShareDraftFlag[] {
  return DETECTORS.flatMap(([flag, pattern]) => (pattern.test(text) ? [flag] : []));
}

export function summarizeShareDraft(draft: ShareDraft): ShareDraftSummary {
  const count = (status: ShareDraftFileStatus) =>
    draft.files.filter((file) => file.status === status).length;
  return {
    slug: draft.slug,
    id: draft.id,
    state: draft.state,
    total: draft.files.length,
    pending: count('pending'),
    kept: count('kept'),
    rewritten: count('rewritten'),
    dropped: count('dropped'),
    flagged: draft.files.filter((file) => file.flags.length > 0).length,
    updatedAt: draft.updatedAt,
  };
}

function parseDraft(raw: string, slug: string): ShareDraft | undefined {
  try {
    const value = JSON.parse(raw) as Partial<ShareDraft>;
    if (
      value.slug !== slug ||
      typeof value.id !== 'string' ||
      (value.state !== 'reviewing' && value.state !== 'ready') ||
      !Array.isArray(value.files) ||
      !Array.isArray(value.skipped)
    )
      return undefined;
    return value as ShareDraft;
  } catch {
    return undefined;
  }
}

export function createShareDrafts(deps: {
  root: string;
  memoryDir: (slug: string) => string | undefined;
  now?: () => Date;
  log?: (event: Record<string, string | number>) => void;
}) {
  const now = () => (deps.now?.() ?? new Date()).toISOString();
  const folder = (slug: string) => join(deps.root, slug);
  const filesDir = (slug: string) => join(folder(slug), FILES);

  const report = (phase: string, outcome: string, extra: Record<string, string | number> = {}) => {
    try {
      deps.log?.({ module: 'share-draft', phase, outcome, ...extra });
    } catch {}
  };

  const load = (slug: string): Result<ShareDraft> => {
    if (!SLUG.test(slug)) return { ok: false, code: 'not-found' };
    let raw: string;
    try {
      raw = readFileSync(join(folder(slug), MANIFEST), 'utf8');
    } catch {
      return { ok: false, code: 'share-draft-not-found' };
    }
    const draft = parseDraft(raw, slug);
    return draft === undefined
      ? { ok: false, code: 'share-draft-unreadable' }
      : { ok: true, value: draft };
  };

  const save = (draft: ShareDraft): ShareDraft => {
    const next = { ...draft, updatedAt: now() };
    const target = join(folder(draft.slug), MANIFEST);
    const temp = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 2));
    renameSync(temp, target);
    return next;
  };

  const fileOf = (draft: ShareDraft, path: string): Result<ShareDraftFile> => {
    const file = draft.files.find((entry) => entry.path === path);
    return file === undefined
      ? { ok: false, code: 'share-draft-file-not-found', path }
      : { ok: true, value: file };
  };

  return {
    root: deps.root,

    start(slug: string): Result<ShareDraft> {
      const memoryDir = deps.memoryDir(slug);
      if (memoryDir === undefined || !SLUG.test(slug)) return { ok: false, code: 'not-found' };
      let plan: UploadPlan;
      try {
        plan = planUpload(memoryDir);
      } catch {
        return { ok: false, code: 'memory-unavailable' };
      }
      if (plan.files.length === 0) return { ok: false, code: 'nothing-to-upload' };
      const staging = join(deps.root, `.${slug}.${randomUUID()}`);
      try {
        mkdirSync(staging, { recursive: true });
        const files: ShareDraftFile[] = [];
        for (const file of plan.files) {
          const target = join(staging, FILES, file.path);
          mkdirSync(dirname(target), { recursive: true });
          copyFileSync(join(memoryDir, file.path), target);
          const flags = file.kind === 'image' ? [] : shareDraftFlags(readFileSync(target, 'utf8'));
          files.push({ ...file, status: 'pending', flags });
        }
        const created = now();
        const draft: ShareDraft = {
          slug,
          id: randomUUID(),
          state: 'reviewing',
          createdAt: created,
          updatedAt: created,
          files,
          skipped: plan.skipped,
        };
        writeFileSync(join(staging, MANIFEST), JSON.stringify(draft, null, 2));
        rmSync(folder(slug), { recursive: true, force: true });
        renameSync(staging, folder(slug));
        report('start', 'ok', { files: files.length });
        return { ok: true, value: draft };
      } catch (error) {
        rmSync(staging, { recursive: true, force: true });
        report('start', 'failed', { reason: (error as NodeJS.ErrnoException).code ?? 'io' });
        return { ok: false, code: 'share-draft-unavailable' };
      }
    },

    get(slug: string): Result<ShareDraft> {
      return load(slug);
    },

    read(
      slug: string,
      path: string,
    ): Result<{ path: string; kind: UploadFileKind; text?: string }> {
      const draft = load(slug);
      if (!draft.ok) return draft;
      const file = fileOf(draft.value, path);
      if (!file.ok) return file;
      if (file.value.status === 'dropped')
        return { ok: true, value: { path, kind: file.value.kind } };
      if (file.value.kind === 'image') return { ok: true, value: { path, kind: 'image' } };
      return {
        ok: true,
        value: {
          path,
          kind: file.value.kind,
          text: readFileSync(join(filesDir(slug), path), 'utf8'),
        },
      };
    },

    decide(slug: string, path: string, decision: ShareDraftDecision): Result<ShareDraft> {
      const draft = load(slug);
      if (!draft.ok) return draft;
      const file = fileOf(draft.value, path);
      if (!file.ok) return file;
      if (!isUploadPath(path)) return { ok: false, code: 'invalid-path', path };
      const target = join(filesDir(slug), path);
      let status: ShareDraftFileStatus;
      let size = file.value.size;
      let flags = file.value.flags;
      if ('drop' in decision) {
        rmSync(target, { force: true });
        status = 'dropped';
      } else if ('rewrite' in decision) {
        if (file.value.kind === 'image') return { ok: false, code: 'not-a-text-file', path };
        const bytes = Buffer.from(decision.rewrite, 'utf8');
        if (bytes.byteLength > MAX_UPLOAD_FILE_BYTES)
          return { ok: false, code: 'file-too-large', path };
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
        status = 'rewritten';
        size = bytes.byteLength;
        flags = shareDraftFlags(decision.rewrite);
      } else {
        if (file.value.status === 'dropped' || !existsSync(target))
          return { ok: false, code: 'share-draft-file-dropped', path };
        status = file.value.status === 'rewritten' ? 'rewritten' : 'kept';
      }
      const files = draft.value.files.map((entry) =>
        entry.path === path ? { ...entry, status, size, flags } : entry,
      );
      return { ok: true, value: save({ ...draft.value, state: 'reviewing', files }) };
    },

    finish(slug: string): Result<ShareDraft> {
      const draft = load(slug);
      if (!draft.ok) return draft;
      const pending = draft.value.files.filter((file) => file.status === 'pending');
      if (pending.length > 0)
        return { ok: false, code: 'share-draft-pending', path: pending[0]!.path };
      if (draft.value.files.every((file) => file.status === 'dropped'))
        return { ok: false, code: 'nothing-to-upload' };
      report('finish', 'ok', { files: draft.value.files.length });
      return { ok: true, value: save({ ...draft.value, state: 'ready' }) };
    },

    discard(slug: string): Result<{ discarded: boolean }> {
      if (!SLUG.test(slug)) return { ok: false, code: 'not-found' };
      const existed = existsSync(folder(slug));
      rmSync(folder(slug), { recursive: true, force: true });
      return { ok: true, value: { discarded: existed } };
    },

    source(slug: string): Result<{ dir: string; plan: UploadPlan; draft: ShareDraft }> {
      const draft = load(slug);
      if (!draft.ok)
        return draft.code === 'share-draft-not-found'
          ? { ok: false, code: 'share-draft-required' }
          : draft;
      if (draft.value.state !== 'ready') return { ok: false, code: 'share-draft-not-ready' };
      const files = draft.value.files
        .filter((file) => file.status !== 'dropped')
        .map(({ path, size, kind }) => ({ path, size, kind }));
      return {
        ok: true,
        value: {
          dir: filesDir(slug),
          draft: draft.value,
          plan: {
            files,
            skipped: draft.value.skipped,
            totalBytes: files.reduce((sum, file) => sum + file.size, 0),
          },
        },
      };
    },

    exportTo(slug: string, target: string): Result<{ path: string; files: number }> {
      const source = this.source(slug);
      if (!source.ok) return source;
      rmSync(target, { recursive: true, force: true });
      mkdirSync(target, { recursive: true });
      cpSync(source.value.dir, target, { recursive: true });
      report('export', 'ok', { files: source.value.plan.files.length });
      return { ok: true, value: { path: target, files: source.value.plan.files.length } };
    },
  };
}

export type ShareDrafts = ReturnType<typeof createShareDrafts>;
