import { zipFile, type ZipImportFile } from './zip-import-file';
import type { ZipImportPreview, ZipImportSource } from './zip-import-upload';
import type { MobileTelemetry } from '../telemetry/mobile-telemetry';
import type { BotOperationPhase, BotOperationReason } from '../telemetry/schema';

export interface BotCreationDraft {
  hostId: string;
  displayName: string;
  persona: string;
  description: string;
  tags: string;
  source?: GitImportDraft | ZipImportDraft;
  avatar?: BotAvatarChoice;
}

export type BotAvatarChoice =
  | { kind: 'generated'; seed: string }
  | { kind: 'photo'; image: string };

export interface ZipImportDraft extends ZipImportSource {
  defaultsApplied?: true;
  preview?: ZipImportSource & { hostId: string; deviceId: string };
}

export interface GitImportSource {
  kind: 'git';
  gitUrl: string;
  commit: string;
  origin?: 'marketplace';
  listingId?: string;
}

export interface GitImportDraft {
  kind: 'git';
  gitUrl: string;
  origin?: 'marketplace';
  listingId?: string;
  expectedCommit?: string;
  preview?: GitImportSource & { hostId: string; deviceId: string };
}

export interface BlankBotInput {
  displayName: string;
  persona?: string;
  description?: string;
  roles?: string[];
}

export interface BotCreationOperation {
  hostId: string;
  deviceId: string;
  operationKey: string;
  input: BlankBotInput;
  source?: GitImportSource | ZipImportSource;
}

export type CreationReceipt =
  | { operationKey: string; botSlug: string; status: 'reserved' }
  | { operationKey: string; botSlug: string; status: 'created'; channelId: string };

export type CreationRecord = (
  | { kind: 'draft'; draft: BotCreationDraft }
  | {
      kind: 'submitted';
      operation: BotCreationOperation;
      mutationStarted: boolean;
      acknowledged?: boolean;
      avatar?: BotAvatarChoice;
    }
) & { unavailableOperations?: BotCreationOperation[] };

export interface CreationSnapshot {
  loaded: boolean;
  record: CreationRecord;
  busy: boolean;
  receipt?: CreationReceipt | undefined;
  error?: string | undefined;
  transfer?: { bytes: number; total: number } | undefined;
  notice?: 'avatar-failed' | undefined;
}

export class BotCreationFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function telemetryFailure(error: unknown): {
  outcome: 'refused' | 'failed' | 'unknown';
  reason: BotOperationReason;
} {
  const code = error instanceof BotCreationFailure ? error.code : undefined;
  switch (code) {
    case 'storage-invalid':
    case 'storage-write':
      return { outcome: 'failed', reason: 'storage' };
    case 'unreachable':
      return { outcome: 'unknown', reason: 'transport' };
    case 'name-required':
    case 'git-url-required':
    case 'git-preview-required':
    case 'zip-preview-required':
      return { outcome: 'refused', reason: 'validation' };
    case 'target-unpaired':
    case 'device-revoked':
    case 'device-unknown':
    case 'device-credential-missing':
      return { outcome: 'refused', reason: 'target-unavailable' };
    case 'host-update-required':
      return { outcome: 'refused', reason: 'host-update-required' };
    case 'git-source-changed':
    case 'zip-file-changed':
      return { outcome: 'refused', reason: 'source-changed' };
    case 'invalid-source':
    case 'zip-file-invalid':
    case 'zip-file-unavailable':
    case 'zip-preview-invalid':
      return { outcome: 'refused', reason: 'source-invalid' };
    default:
      return { outcome: 'unknown', reason: 'unknown' };
  }
}

const emptyDraft = (): BotCreationDraft => ({
  hostId: '',
  displayName: '',
  persona: '',
  description: '',
  tags: '',
});

export function normalizedBlankInput(draft: BotCreationDraft): BlankBotInput {
  const persona = draft.persona.trim();
  const description = draft.description.trim();
  const roles = [
    ...new Set(
      draft.tags
        .split(/[,，]/u)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  return {
    displayName: draft.displayName.trim(),
    ...(persona && !draft.source ? { persona } : {}),
    ...(description ? { description } : {}),
    ...(roles.length ? { roles } : {}),
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function gitImportSource(value: unknown): GitImportSource {
  if (
    !object(value) ||
    value.kind !== 'git' ||
    typeof value.gitUrl !== 'string' ||
    !value.gitUrl.trim() ||
    typeof value.commit !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value.commit)
  )
    throw new BotCreationFailure('invalid-source');
  return {
    kind: 'git',
    gitUrl: value.gitUrl,
    commit: value.commit,
    ...(value.origin === 'marketplace' ? { origin: 'marketplace' } : {}),
    ...(typeof value.listingId === 'string' ? { listingId: value.listingId } : {}),
  };
}

export function zipImportSource(value: unknown): ZipImportSource {
  if (
    !object(value) ||
    value.kind !== 'zip' ||
    typeof value.uploadKey !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value.uploadKey)
  )
    throw new BotCreationFailure('zip-file-invalid');
  return { ...zipFile(value), kind: 'zip', uploadKey: value.uploadKey };
}

function importSource(value: unknown): GitImportSource | ZipImportSource {
  return object(value) && value.kind === 'zip' ? zipImportSource(value) : gitImportSource(value);
}

function sourceDraft(
  source: GitImportSource | ZipImportSource | GitImportDraft | ZipImportDraft,
): GitImportDraft | ZipImportDraft {
  if (source.kind === 'zip') return { ...zipImportSource(source), defaultsApplied: true };
  return {
    kind: 'git',
    gitUrl: source.gitUrl,
    ...(source.origin ? { origin: source.origin } : {}),
    ...(source.listingId ? { listingId: source.listingId } : {}),
    ...('commit' in source
      ? { expectedCommit: source.commit }
      : source.expectedCommit
        ? { expectedCommit: source.expectedCommit }
        : {}),
  };
}

function draftSource(value: unknown): GitImportDraft | ZipImportDraft {
  if (object(value) && value.kind === 'zip') {
    const source: ZipImportDraft = {
      ...zipImportSource(value),
      ...(value.defaultsApplied === true ? { defaultsApplied: true } : {}),
    };
    if (value.preview === undefined) return source;
    const preview = value.preview;
    if (
      !object(preview) ||
      typeof preview.hostId !== 'string' ||
      typeof preview.deviceId !== 'string'
    )
      throw new BotCreationFailure('storage-invalid');
    return {
      ...source,
      preview: { ...zipImportSource(preview), hostId: preview.hostId, deviceId: preview.deviceId },
    };
  }
  if (!object(value) || value.kind !== 'git' || typeof value.gitUrl !== 'string')
    throw new BotCreationFailure('storage-invalid');
  const source: GitImportDraft = {
    kind: 'git',
    gitUrl: value.gitUrl,
    ...(value.origin === 'marketplace' ? { origin: 'marketplace' } : {}),
    ...(typeof value.listingId === 'string' ? { listingId: value.listingId } : {}),
    ...(typeof value.expectedCommit === 'string' ? { expectedCommit: value.expectedCommit } : {}),
  };
  if (value.preview === undefined) return source;
  const preview = value.preview;
  if (
    !object(preview) ||
    typeof preview.hostId !== 'string' ||
    typeof preview.deviceId !== 'string'
  )
    throw new BotCreationFailure('storage-invalid');
  return {
    ...source,
    preview: { ...gitImportSource(preview), hostId: preview.hostId, deviceId: preview.deviceId },
  };
}

const AVATAR_IMAGE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/u;

function avatarChoice(value: unknown): Pick<BotCreationDraft, 'avatar'> {
  if (value === undefined) return {};
  if (object(value) && value.kind === 'generated' && typeof value.seed === 'string' && value.seed)
    return { avatar: { kind: 'generated', seed: value.seed } };
  if (
    object(value) &&
    value.kind === 'photo' &&
    typeof value.image === 'string' &&
    AVATAR_IMAGE.test(value.image)
  )
    return { avatar: { kind: 'photo', image: value.image } };
  throw new BotCreationFailure('storage-invalid');
}

export function repositoryName(gitUrl: string): string {
  const path = gitUrl
    .trim()
    .replace(/[?#].*$/u, '')
    .replace(/\/+$/u, '');
  const last = path.split(/[/:]/u).at(-1) ?? '';
  return last
    .replace(/\.git$/iu, '')
    .replace(/[-_]+/gu, ' ')
    .trim()
    .slice(0, 120);
}

function unpreviewed(source: GitImportDraft | ZipImportDraft): GitImportDraft | ZipImportDraft {
  const { preview: _preview, ...draft } = source;
  return draft;
}

export function parseCreationRecord(value: unknown): CreationRecord {
  if (!object(value)) throw new BotCreationFailure('storage-invalid');
  const unavailableOperations = parseUnavailableOperations(value.unavailableOperations);
  if (value.kind === 'draft' && object(value.draft)) {
    const d = value.draft;
    if (
      typeof d.hostId === 'string' &&
      typeof d.displayName === 'string' &&
      typeof d.persona === 'string' &&
      typeof d.description === 'string' &&
      typeof d.tags === 'string'
    )
      return {
        kind: 'draft',
        ...unavailableOperations,
        draft: {
          hostId: d.hostId,
          displayName: d.displayName,
          persona: d.persona,
          description: d.description,
          tags: d.tags,
          ...(d.source === undefined ? {} : { source: draftSource(d.source) }),
          ...avatarChoice(d.avatar),
        },
      };
  }
  if (
    value.kind === 'submitted' &&
    typeof value.mutationStarted === 'boolean' &&
    object(value.operation)
  ) {
    const o = value.operation;
    const input = o.input;
    if (
      typeof o.hostId === 'string' &&
      o.hostId !== '' &&
      typeof o.deviceId === 'string' &&
      o.deviceId !== '' &&
      typeof o.operationKey === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(o.operationKey) &&
      object(input) &&
      typeof input.displayName === 'string' &&
      input.displayName.trim() !== '' &&
      (input.persona === undefined || typeof input.persona === 'string') &&
      (input.description === undefined || typeof input.description === 'string') &&
      (input.roles === undefined ||
        (Array.isArray(input.roles) &&
          input.roles.every((role): role is string => typeof role === 'string')))
    )
      return {
        kind: 'submitted',
        ...unavailableOperations,
        mutationStarted: value.mutationStarted,
        ...(value.acknowledged === true ? { acknowledged: true } : {}),
        ...avatarChoice(value.avatar),
        operation: {
          hostId: o.hostId,
          deviceId: o.deviceId,
          operationKey: o.operationKey,
          ...(o.source === undefined ? {} : { source: importSource(o.source) }),
          input: {
            displayName: input.displayName,
            ...(input.persona === undefined ? {} : { persona: input.persona }),
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.roles === undefined ? {} : { roles: input.roles }),
          },
        },
      };
  }
  throw new BotCreationFailure('storage-invalid');
}

function parseUnavailableOperations(value: unknown): Pick<CreationRecord, 'unavailableOperations'> {
  if (value === undefined) return {};
  if (!Array.isArray(value)) throw new BotCreationFailure('storage-invalid');
  return {
    unavailableOperations: value.map((operation) => {
      const record = parseCreationRecord({ kind: 'submitted', operation, mutationStarted: true });
      if (record.kind !== 'submitted') throw new BotCreationFailure('storage-invalid');
      return record.operation;
    }),
  };
}

export function creationReceipt(value: unknown, key: string): CreationReceipt | null {
  if (value === null) return null;
  if (
    !object(value) ||
    value.operationKey !== key ||
    typeof value.botSlug !== 'string' ||
    !value.botSlug
  )
    throw new BotCreationFailure('invalid-receipt');
  if (value.status === 'reserved')
    return { operationKey: key, botSlug: value.botSlug, status: 'reserved' };
  if (value.status === 'created' && typeof value.channelId === 'string' && value.channelId)
    return {
      operationKey: key,
      botSlug: value.botSlug,
      status: 'created',
      channelId: value.channelId,
    };
  throw new BotCreationFailure('invalid-receipt');
}

export interface BotCreationPort {
  pickZip?(): Promise<ZipImportFile | null>;
  discardZip?(file: ZipImportFile): void;
  previewZip?(
    target: { hostId: string; deviceId: string },
    source: ZipImportSource,
    progress: (bytes: number, total: number) => void,
  ): Promise<ZipImportPreview>;
  preview?(target: { hostId: string; deviceId: string }, gitUrl: string): Promise<GitImportSource>;
  lookup(operation: BotCreationOperation): Promise<CreationReceipt | null>;
  create(
    operation: BotCreationOperation,
    progress?: (bytes: number, total: number) => void,
  ): Promise<CreationReceipt>;
  deviceId(hostId: string): string | undefined;
  applyAvatar?(
    operation: BotCreationOperation,
    receipt: Extract<CreationReceipt, { status: 'created' }>,
    avatar: BotAvatarChoice,
  ): Promise<void>;
}

export function createBotCreationController(options: {
  storage: { read(): Promise<unknown>; write(record: CreationRecord): Promise<void> };
  port: BotCreationPort;
  key(): string;
  telemetry?: Pick<MobileTelemetry, 'botOperation'>;
}) {
  let snapshot: CreationSnapshot = {
    loaded: false,
    record: { kind: 'draft', draft: emptyDraft() },
    busy: false,
  };
  const listeners = new Set<() => void>();
  let storageFailed = false;
  let writing = Promise.resolve();
  let active: Promise<void> | undefined;
  const retainUnavailable = (record: CreationRecord): CreationRecord =>
    record.unavailableOperations || !snapshot.record.unavailableOperations
      ? record
      : { ...record, unavailableOperations: snapshot.record.unavailableOperations };
  const publish = (patch: Partial<CreationSnapshot>) => {
    snapshot = {
      ...snapshot,
      ...patch,
      ...(patch.record ? { record: retainUnavailable(patch.record) } : {}),
    };
    for (const listener of listeners) listener();
  };
  const save = (record: CreationRecord) => {
    const retained = retainUnavailable(record);
    const task = writing.then(() => options.storage.write(retained));
    writing = task.catch(() => {});
    return task;
  };
  const fail = (error: unknown) =>
    publish({
      error: error instanceof BotCreationFailure ? error.code : 'unreachable',
    });
  const ready = options.storage
    .read()
    .then((raw) => {
      publish({
        loaded: true,
        record: raw === undefined ? snapshot.record : parseCreationRecord(raw),
      });
    })
    .catch(() => {
      storageFailed = true;
      publish({ loaded: true, error: 'storage-invalid' });
    });
  const reconcile = async (
    operation: BotCreationOperation,
    allowCreate: boolean,
  ): Promise<'created' | 'recovered' | 'pending'> => {
    if (options.port.deviceId(operation.hostId) !== operation.deviceId)
      throw new BotCreationFailure('target-unpaired');
    const receipt = await options.port.lookup(operation);
    if (options.port.deviceId(operation.hostId) !== operation.deviceId)
      throw new BotCreationFailure('target-unpaired');
    publish({ receipt: receipt ?? undefined });
    if (receipt?.status === 'created') return 'recovered';
    if (!allowCreate && receipt === null) return 'pending';
    if (options.port.deviceId(operation.hostId) !== operation.deviceId)
      throw new BotCreationFailure('target-unpaired');
    const record: CreationRecord = {
      kind: 'submitted',
      operation,
      mutationStarted: true,
      ...(snapshot.record.kind === 'submitted' && snapshot.record.avatar
        ? { avatar: snapshot.record.avatar }
        : {}),
    };
    try {
      await save(record);
    } catch {
      throw new BotCreationFailure('storage-write');
    }
    publish({ record });
    const created = await options.port.create(operation, (bytes, total) =>
      publish({ transfer: { bytes, total } }),
    );
    if (options.port.deviceId(operation.hostId) !== operation.deviceId)
      throw new BotCreationFailure('target-unpaired');
    publish({ receipt: created });
    return created.status === 'created' ? 'created' : 'pending';
  };
  const applyAvatar = async <T>(result: T): Promise<T> => {
    const record = snapshot.record;
    const receipt = snapshot.receipt;
    if (record.kind !== 'submitted' || !record.avatar || receipt?.status !== 'created')
      return result;
    if (options.port.deviceId(record.operation.hostId) !== record.operation.deviceId) return result;
    try {
      await options.port.applyAvatar?.(record.operation, receipt, record.avatar);
    } catch {
      publish({ notice: 'avatar-failed' });
    }
    const { avatar: _avatar, ...settled } = record;
    try {
      await save(settled);
    } catch {}
    publish({ record: settled });
    return result;
  };
  const run = (
    work: () => Promise<void | 'created' | 'recovered' | 'pending'>,
    phase?: BotOperationPhase,
  ): Promise<void> => {
    if (active) return active;
    let observation: ReturnType<MobileTelemetry['botOperation']> | undefined;
    const finish = (...args: Parameters<NonNullable<typeof observation>['finish']>) => {
      try {
        observation?.finish(...args);
      } catch {}
    };
    publish({ busy: true, error: undefined, transfer: undefined });
    active = Promise.resolve()
      .then(async () => {
        await ready;
        const record = snapshot.record;
        const source = record.kind === 'draft' ? record.draft.source : record.operation.source;
        if (
          phase &&
          !storageFailed &&
          snapshot.receipt?.status !== 'created' &&
          !(record.kind === 'submitted' && record.acknowledged) &&
          (phase !== 'preview' || (record.kind === 'draft' && source)) &&
          (phase !== 'recover' || record.kind === 'submitted')
        ) {
          try {
            observation = options.telemetry?.botOperation(
              source?.kind === 'git' && source.origin === 'marketplace'
                ? 'marketplace'
                : (source?.kind ?? 'blank'),
              phase,
            );
          } catch {}
        }
        const result = await work();
        finish(result ?? (phase === 'preview' ? 'preview_ready' : 'pending'));
      })
      .catch((error: unknown) => {
        const result = telemetryFailure(error);
        finish(result.outcome, result.reason);
        fail(error);
      })
      .finally(() => {
        active = undefined;
        publish({ busy: false });
      });
    return active;
  };
  return {
    ready,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async edit(draft: BotCreationDraft) {
      await ready;
      if (storageFailed || snapshot.busy || snapshot.record.kind !== 'draft') return;
      const previous = snapshot.record.draft;
      const changed =
        draft.hostId !== previous.hostId ||
        draft.source?.kind !== previous.source?.kind ||
        (draft.source?.kind === 'git' &&
          (previous.source?.kind !== 'git' || draft.source.gitUrl !== previous.source.gitUrl)) ||
        (draft.source?.kind === 'zip' &&
          (previous.source?.kind !== 'zip' || draft.source.fileId !== previous.source.fileId));
      const record: CreationRecord = {
        kind: 'draft',
        draft: {
          ...draft,
          ...(changed && draft.source ? { source: unpreviewed(draft.source) } : {}),
        },
      };
      publish({ record, error: undefined });
      try {
        await save(record);
      } catch {
        publish({ error: 'storage-write' });
      }
    },
    beginZip() {
      return run(async () => {
        await ready;
        if (storageFailed || snapshot.record.kind !== 'draft') return;
        if (!options.port.pickZip) throw new BotCreationFailure('zip-file-unavailable');
        const file = await options.port.pickZip();
        if (!file) return;
        const record: CreationRecord = {
          kind: 'draft',
          draft: {
            ...snapshot.record.draft,
            source: { ...zipFile(file), kind: 'zip', uploadKey: options.key() },
          },
        };
        try {
          await save(record);
          publish({ record, receipt: undefined });
        } catch {
          throw new BotCreationFailure('storage-write');
        } finally {
          options.port.discardZip?.(file);
        }
      });
    },
    restoreZip() {
      return run(async () => {
        await ready;
        if (storageFailed || snapshot.record.kind !== 'submitted') return;
        const previous = snapshot.record;
        const source = previous.operation.source;
        if (source?.kind !== 'zip' || !options.port.pickZip) return;
        const file = await options.port.pickZip();
        if (!file) return;
        try {
          const checked = zipFile(file);
          if (checked.sha256 !== source.sha256 || checked.sizeBytes !== source.sizeBytes)
            throw new BotCreationFailure('zip-file-changed');
          const record: CreationRecord = {
            ...previous,
            operation: { ...previous.operation, source: { ...source, fileId: checked.fileId } },
          };
          try {
            await save(record);
            publish({ record });
          } catch {
            throw new BotCreationFailure('storage-write');
          }
        } finally {
          options.port.discardZip?.(file);
        }
      });
    },
    beginImport(input: {
      gitUrl: string;
      displayName?: string;
      description?: string;
      roles?: string[];
      origin?: 'marketplace';
      listingId?: string;
      expectedCommit?: string;
    }) {
      return run(async () => {
        await ready;
        if (storageFailed || snapshot.record.kind !== 'draft') return;
        const previous = snapshot.record.draft;
        const sameListing =
          input.origin === 'marketplace' &&
          !!input.listingId &&
          previous.source?.kind === 'git' &&
          previous.source.origin === 'marketplace' &&
          previous.source.listingId === input.listingId;
        const draft: BotCreationDraft = {
          ...previous,
          source: {
            kind: 'git',
            gitUrl: input.gitUrl,
            ...(input.origin ? { origin: input.origin } : {}),
            ...(input.listingId ? { listingId: input.listingId } : {}),
            ...(input.expectedCommit ? { expectedCommit: input.expectedCommit } : {}),
          },
          ...(sameListing || input.displayName === undefined
            ? {}
            : { displayName: input.displayName }),
          ...(sameListing || input.description === undefined
            ? {}
            : { description: input.description }),
          ...(sameListing || input.roles === undefined ? {} : { tags: input.roles.join(', ') }),
        };
        const record: CreationRecord = { kind: 'draft', draft };
        try {
          await save(record);
          publish({ record, receipt: undefined });
        } catch {
          throw new BotCreationFailure('storage-write');
        }
      });
    },
    blank() {
      return run(async () => {
        await ready;
        if (storageFailed || snapshot.record.kind !== 'draft') return;
        const { source: _source, ...draft } = snapshot.record.draft;
        const record: CreationRecord = { kind: 'draft', draft };
        try {
          await save(record);
          publish({ record });
        } catch {
          throw new BotCreationFailure('storage-write');
        }
      });
    },
    preview() {
      return run(async () => {
        await ready;
        if (storageFailed) throw new BotCreationFailure('storage-invalid');
        if (snapshot.record.kind !== 'draft' || !snapshot.record.draft.source) return;
        const draft = snapshot.record.draft;
        const source = draft.source!;
        if (source.kind === 'zip') {
          const deviceId = options.port.deviceId(draft.hostId);
          if (!deviceId) throw new BotCreationFailure('target-unpaired');
          if (!options.port.previewZip) throw new BotCreationFailure('host-update-required');
          const preview = await options.port.previewZip(
            { hostId: draft.hostId, deviceId },
            source,
            (bytes, total) => publish({ transfer: { bytes, total } }),
          );
          if (options.port.deviceId(draft.hostId) !== deviceId)
            throw new BotCreationFailure('target-unpaired');
          const checked = zipImportSource(preview.source);
          if (
            checked.sha256 !== source.sha256 ||
            checked.fileId !== source.fileId ||
            checked.uploadKey !== source.uploadKey ||
            checked.sizeBytes !== source.sizeBytes
          )
            throw new BotCreationFailure('zip-file-changed');
          const record: CreationRecord = {
            kind: 'draft',
            draft: {
              ...draft,
              displayName: source.defaultsApplied
                ? draft.displayName
                : draft.displayName || preview.displayName,
              description: source.defaultsApplied
                ? draft.description
                : draft.description || preview.description || '',
              tags: source.defaultsApplied
                ? draft.tags
                : draft.tags || preview.roles?.join(', ') || '',
              source: {
                ...source,
                defaultsApplied: true,
                preview: { ...checked, hostId: draft.hostId, deviceId },
              },
            },
          };
          try {
            await save(record);
            publish({ record });
          } catch {
            throw new BotCreationFailure('storage-write');
          }
          return;
        }
        if (!source.gitUrl.trim()) throw new BotCreationFailure('git-url-required');
        const deviceId = options.port.deviceId(draft.hostId);
        if (!deviceId) throw new BotCreationFailure('target-unpaired');
        if (!options.port.preview) throw new BotCreationFailure('host-update-required');
        const preview = gitImportSource(
          await options.port.preview({ hostId: draft.hostId, deviceId }, source.gitUrl.trim()),
        );
        if (options.port.deviceId(draft.hostId) !== deviceId)
          throw new BotCreationFailure('target-unpaired');
        if (source.expectedCommit && preview.commit !== source.expectedCommit)
          throw new BotCreationFailure('git-source-changed');
        const record: CreationRecord = {
          kind: 'draft',
          draft: {
            ...draft,
            displayName: draft.displayName || repositoryName(preview.gitUrl),
            source: {
              ...source,
              gitUrl: preview.gitUrl,
              preview: {
                ...preview,
                ...(source.origin ? { origin: source.origin } : {}),
                ...(source.listingId ? { listingId: source.listingId } : {}),
                hostId: draft.hostId,
                deviceId,
              },
            },
          },
        };
        try {
          await save(record);
          publish({ record });
        } catch {
          throw new BotCreationFailure('storage-write');
        }
      }, 'preview');
    },
    enter(
      entry:
        | { kind: 'all'; hostId?: string }
        | { kind: 'host'; hostId: string }
        | { kind: 'resume' },
    ) {
      return run(async () => {
        await ready;
        if (storageFailed || entry.kind === 'resume' || snapshot.record.kind !== 'draft') return;
        const record: CreationRecord = {
          kind: 'draft',
          draft: {
            ...snapshot.record.draft,
            hostId: entry.hostId ?? '',
            ...(snapshot.record.draft.source
              ? { source: unpreviewed(snapshot.record.draft.source) }
              : {}),
          },
        };
        publish({ record });
        try {
          await save(record);
        } catch {
          publish({ error: 'storage-write' });
        }
      });
    },
    submit() {
      return run(async () => {
        await ready;
        if (storageFailed) throw new BotCreationFailure('storage-invalid');
        if (snapshot.record.kind === 'submitted')
          return applyAvatar(await reconcile(snapshot.record.operation, true));
        const draft = snapshot.record.draft;
        if (!draft.displayName.trim()) throw new BotCreationFailure('name-required');
        const deviceId = options.port.deviceId(draft.hostId);
        if (!deviceId) throw new BotCreationFailure('target-unpaired');
        const source = draft.source?.preview;
        if (
          draft.source &&
          (!source ||
            source.hostId !== draft.hostId ||
            source.deviceId !== deviceId ||
            source.kind !== draft.source.kind ||
            (source.kind === 'git' &&
              draft.source.kind === 'git' &&
              source.gitUrl !== draft.source.gitUrl) ||
            (source.kind === 'zip' &&
              draft.source.kind === 'zip' &&
              (source.sha256 !== draft.source.sha256 ||
                source.uploadKey !== draft.source.uploadKey)))
        )
          throw new BotCreationFailure(
            draft.source.kind === 'zip' ? 'zip-preview-required' : 'git-preview-required',
          );
        const operation: BotCreationOperation = {
          hostId: draft.hostId,
          deviceId,
          operationKey: options.key(),
          input: normalizedBlankInput(draft),
          ...(source ? { source: importSource(source) } : {}),
        };
        const record: CreationRecord = {
          kind: 'submitted',
          operation,
          mutationStarted: false,
          ...(draft.avatar ? { avatar: draft.avatar } : {}),
        };
        try {
          await save(record);
        } catch {
          throw new BotCreationFailure('storage-write');
        }
        publish({ record });
        return applyAvatar(await reconcile(operation, true));
      }, 'submit');
    },
    resume() {
      return run(async () => {
        await ready;
        if (storageFailed) throw new BotCreationFailure('storage-invalid');
        if (snapshot.record.kind === 'submitted')
          return applyAvatar(
            await reconcile(snapshot.record.operation, snapshot.record.mutationStarted),
          );
      }, 'recover');
    },
    editBeforeSend() {
      return run(async () => {
        await ready;
        const previous = snapshot.record;
        if (
          storageFailed ||
          previous.kind !== 'submitted' ||
          previous.mutationStarted ||
          snapshot.receipt
        )
          return;
        const { hostId, input } = previous.operation;
        const record: CreationRecord = {
          kind: 'draft',
          draft: {
            hostId,
            displayName: input.displayName,
            persona: input.persona ?? '',
            description: input.description ?? '',
            tags: input.roles?.join(', ') ?? '',
            ...(previous.avatar ? { avatar: previous.avatar } : {}),
            ...(previous.operation.source
              ? {
                  source: sourceDraft(previous.operation.source),
                }
              : {}),
          },
        };
        try {
          await save(record);
          publish({ record, error: undefined });
        } catch {
          publish({ error: 'storage-write' });
        }
      });
    },
    dismissNotice() {
      if (snapshot.notice) publish({ notice: undefined });
    },
    async acknowledge(operationKey: string) {
      if (
        snapshot.record.kind !== 'submitted' ||
        snapshot.record.operation.operationKey !== operationKey ||
        snapshot.receipt?.status !== 'created' ||
        snapshot.error ||
        snapshot.busy
      )
        return;
      const record: CreationRecord = { ...snapshot.record, acknowledged: true };
      return run(async () => {
        try {
          await save(record);
          publish({ record });
        } catch {
          publish({ error: 'storage-write' });
        }
      });
    },
    newAfterUnavailable() {
      if (
        snapshot.error !== 'creation-identity-unavailable' ||
        snapshot.record.kind !== 'submitted'
      )
        return Promise.resolve();
      const previous = snapshot.record;
      return run(async () => {
        if (storageFailed) return;
        const record: CreationRecord = {
          kind: 'draft',
          draft: { ...emptyDraft(), hostId: previous.operation.hostId },
          unavailableOperations: [...(previous.unavailableOperations ?? []), previous.operation],
        };
        try {
          await save(record);
          publish({ record, receipt: undefined });
        } catch {
          publish({ error: 'storage-write' });
        }
      });
    },
    newAfterSourceChanged() {
      if (
        snapshot.error !== 'git-source-changed' ||
        snapshot.record.kind !== 'submitted' ||
        !snapshot.record.operation.source
      )
        return Promise.resolve();
      const previous = snapshot.record;
      const { hostId, input, source } = previous.operation;
      if (!source || source.kind !== 'git') return Promise.resolve();
      return run(async () => {
        if (storageFailed) return;
        const record: CreationRecord = {
          kind: 'draft',
          draft: {
            hostId,
            displayName: input.displayName,
            persona: '',
            description: input.description ?? '',
            tags: input.roles?.join(', ') ?? '',
            source: {
              kind: 'git',
              gitUrl: source.gitUrl,
              ...(source.origin ? { origin: source.origin, expectedCommit: source.commit } : {}),
              ...(source.listingId ? { listingId: source.listingId } : {}),
            },
          },
          unavailableOperations: [...(previous.unavailableOperations ?? []), previous.operation],
        };
        try {
          await save(record);
          publish({ record, receipt: undefined });
        } catch {
          throw new BotCreationFailure('storage-write');
        }
      });
    },
    another(hostId = '') {
      return run(async () => {
        await ready;
        if (
          storageFailed ||
          (snapshot.record.kind === 'submitted' &&
            !snapshot.record.acknowledged &&
            snapshot.receipt?.status !== 'created')
        )
          return;
        const previous = snapshot.record;
        const source =
          previous.kind === 'submitted' ? previous.operation.source : previous.draft.source;
        const nextSource =
          source?.kind === 'git' && source.origin !== 'marketplace'
            ? { kind: 'git' as const, gitUrl: source.gitUrl }
            : source
              ? sourceDraft(source)
              : undefined;
        const record: CreationRecord = {
          kind: 'draft',
          draft: {
            ...emptyDraft(),
            hostId,
            ...(source
              ? {
                  source: nextSource!,
                  displayName:
                    previous.kind === 'submitted'
                      ? previous.operation.input.displayName
                      : previous.draft.displayName,
                  description:
                    previous.kind === 'submitted'
                      ? (previous.operation.input.description ?? '')
                      : previous.draft.description,
                  tags:
                    previous.kind === 'submitted'
                      ? (previous.operation.input.roles?.join(', ') ?? '')
                      : previous.draft.tags,
                }
              : {}),
          },
        };
        try {
          await save(record);
          publish({ record, receipt: undefined, error: undefined });
        } catch {
          publish({ error: 'storage-write' });
        }
      });
    },
  };
}
