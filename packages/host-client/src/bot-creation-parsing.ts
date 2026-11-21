import { isAvatarRecipe } from '../../core/src/bots/avatar-appearance';
import { creationTags } from './bot-creation-tags';
import {
  BotCreationFailure,
  type BlankBotInput,
  type BotCreationDraft,
  type CreationReceipt,
  type CreationRecord,
  type GitImportDraft,
  type GitImportSource,
  type ZipImportDraft,
} from './bot-creation-types';
import { zipFile } from './zip-import-file';
import type { ZipImportSource } from './zip-import-upload';

export function normalizedBlankInput(draft: BotCreationDraft): BlankBotInput {
  const persona = draft.persona.trim();
  const description = draft.description.trim();
  const roles = creationTags(`${draft.tags},${draft.tagInput ?? ''}`);
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

export function importSource(value: unknown): GitImportSource | ZipImportSource {
  return object(value) && value.kind === 'zip' ? zipImportSource(value) : gitImportSource(value);
}

export function sourceDraft(
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
    return {
      avatar: {
        kind: 'generated',
        seed: value.seed,
        ...(value.origin === 'initial' ? { origin: 'initial' } : {}),
      },
    };
  if (object(value) && value.kind === 'recipe' && isAvatarRecipe(value.recipe))
    return { avatar: { kind: 'recipe', recipe: value.recipe } };
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
      typeof d.tags === 'string' &&
      (d.tagInput === undefined || typeof d.tagInput === 'string')
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
          ...(typeof d.tagInput === 'string' ? { tagInput: d.tagInput } : {}),
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
