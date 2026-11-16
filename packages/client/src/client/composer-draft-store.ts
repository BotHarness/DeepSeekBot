import type { ChannelComposerUpload } from './channel-composer.js';
import type { ChannelMessage } from './store.js';
import type { SelectedMention } from './mentions.js';
import type { SelectedChannelRef } from './channel-refs.js';
import { rebaseSkills, type SelectedSkill } from './skill-refs.js';
import { parseSkillOwnerKey, skillOwnerKey } from '../../../core/src/skills/entries.js';
import { isChannelAttachmentRef } from '../../../core/src/attachments/ref.js';

export interface ComposerDraft {
  text: string;
  mentions: SelectedMention[];
  channelRefs: SelectedChannelRef[];
  skills: SelectedSkill[];
  reply: ChannelMessage | undefined;
  uploads: ChannelComposerUpload[];
}

export interface Version {
  writer: string;
  sequence: number;
  seen: Record<string, number>;
  draft: ComposerDraft;
  notice?: boolean;
}

export interface DraftSnapshot {
  draft: ComposerDraft;
  versions: readonly Version[];
  error: 'unavailable' | 'corrupt' | 'quota' | undefined;
  needsValidation: boolean;
  notice: boolean;
}

export type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
const PREFIX = 'botharness.composer.v1:';
const MAX_BYTES = 1_048_576;
const MAX_VERSIONS = 100;

export function emptyComposerDraft(): ComposerDraft {
  return { text: '', mentions: [], channelRefs: [], skills: [], reply: undefined, uploads: [] };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error();
  return value;
}

function number(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error();
  return value as number;
}

function parseVersion(raw: string): Version {
  if (raw.length > MAX_BYTES) throw new Error();
  const source = record(JSON.parse(raw));
  if (source['version'] !== 1) throw new Error();
  const saved = record(source['draft']);
  const text = string(saved['text']);
  const tokens = (value: unknown, marker: string): Record<string, unknown>[] => {
    if (!Array.isArray(value) || value.length > 1000) throw new Error();
    return value.map((entry) => {
      const token = record(entry);
      const start = number(token['start']);
      const end = number(token['end']);
      const label = string(token['label']);
      if (text.slice(start, end) !== marker + label || end <= start) throw new Error();
      return { ...token, start, end, label };
    });
  };
  const mentions = tokens(saved['mentions'], '@').flatMap((token): SelectedMention[] => {
    if (token['kind'] === 'all-bots') return [];
    return [
      {
        botSlug: string(token['botSlug']),
        label: string(token['label']),
        start: number(token['start']),
        end: number(token['end']),
      },
    ];
  });
  const channelRefs = tokens(saved['channelRefs'], '#').map((token) => ({
    channelId: string(token['channelId']),
    label: string(token['label']),
    start: number(token['start']),
    end: number(token['end']),
  }));
  const skills = (saved['skills'] === undefined ? [] : tokens(saved['skills'], '/')).flatMap(
    (token): SelectedSkill[] => {
      const owner = parseSkillOwnerKey(string(token['owner']));
      return owner === undefined
        ? []
        : [
            {
              name: string(token['label']),
              owner,
              start: number(token['start']),
              end: number(token['end']),
            },
          ];
    },
  );
  let reply: ChannelMessage | undefined;
  if (saved['reply'] !== null) {
    const target = record(saved['reply']);
    reply = { id: string(target['id']), at: '', author: { kind: 'human' }, body: '' };
  }
  if (!Array.isArray(saved['uploads']) || saved['uploads'].length > 10) throw new Error();
  const uploads = saved['uploads'].map((entry): ChannelComposerUpload => {
    const upload = record(entry);
    const name = string(upload['name']);
    const mime = string(upload['mime']);
    const ref = upload['ref'];
    if (ref !== undefined && !isChannelAttachmentRef(ref)) throw new Error();
    return {
      id: string(upload['id']),
      file: new File([], name, { type: mime }),
      status: 'error',
      fileAvailable: false,
      ...(ref === undefined ? {} : { ref }),
    };
  });
  const seen = Object.fromEntries(
    Object.entries(record(source['seen'])).map(([writer, sequence]) => [writer, number(sequence)]),
  );
  return {
    writer: string(source['writer']),
    sequence: number(source['sequence']),
    seen,
    draft: { text, mentions, channelRefs, skills, reply, uploads },
    notice:
      source['reselectAllBots'] === true ||
      mentions.length !== (saved['mentions'] as unknown[]).length,
  };
}

function serialize(version: Version): string {
  const draft = version.draft;
  return JSON.stringify({
    version: 1,
    writer: version.writer,
    sequence: version.sequence,
    seen: version.seen,
    reselectAllBots: version.draft.mentions.some((mention) => mention.kind === 'all-bots'),
    draft: {
      text: draft.text,
      mentions: draft.mentions.filter(
        (token) => draft.text.slice(token.start, token.end) === '@' + token.label,
      ),
      channelRefs: draft.channelRefs.filter(
        (token) => draft.text.slice(token.start, token.end) === '#' + token.label,
      ),
      skills: draft.skills
        .filter((token) => draft.text.slice(token.start, token.end) === '/' + token.name)
        .map((token) => ({
          label: token.name,
          owner: skillOwnerKey(token.owner),
          start: token.start,
          end: token.end,
        })),
      reply: draft.reply === undefined ? null : { id: draft.reply.id },
      uploads: draft.uploads.map((upload) => ({
        id: upload.id,
        name: upload.file.name,
        mime: upload.file.type,
        ...(upload.ref === undefined ? {} : { ref: upload.ref }),
      })),
    },
  });
}

function dominates(newer: Version, older: Version): boolean {
  return (
    (newer.writer === older.writer && newer.sequence > older.sequence) ||
    (newer.seen[older.writer] ?? -1) >= older.sequence
  );
}

function sameDraft(left: Version, right: Version): boolean {
  const body = (version: Version): string =>
    serialize({ writer: '', sequence: 0, seen: {}, draft: version.draft });
  return body(left) === body(right);
}

export class ComposerDraftStore {
  private readonly snapshots = new Map<string, DraftSnapshot>();
  private readonly current = new Map<string, Version>();
  private readonly editing = new Set<string>();
  private readonly twins = new Map<string, Version[]>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: DraftStorage | undefined,
    private readonly writer: string,
  ) {}

  clearMemory(): void {
    this.snapshots.clear();
    this.current.clear();
    this.editing.clear();
    this.twins.clear();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(scope: string, snapshot: DraftSnapshot): void {
    this.snapshots.set(scope, snapshot);
    for (const listener of this.listeners) listener();
  }

  read(scope: string): DraftSnapshot {
    const cached = this.snapshots.get(scope);
    if (cached !== undefined) return cached;
    this.sync(scope);
    return this.snapshots.get(scope)!;
  }

  setEditing(scope: string, editing: boolean): void {
    if (editing) this.editing.add(scope);
    else this.editing.delete(scope);
  }

  sync(scope: string): void {
    const prefix = PREFIX + encodeURIComponent(scope) + ':';
    const versions: Version[] = [];
    let error: DraftSnapshot['error'];
    try {
      if (this.storage === undefined) error = 'unavailable';
      else {
        for (let index = 0; index < this.storage.length; index++) {
          const key = this.storage.key(index);
          if (key?.startsWith(prefix) !== true) continue;
          const raw = this.storage.getItem(key);
          if (raw === null) continue;
          const parsed = parseVersion(raw);
          if (key !== prefix + parsed.writer + ':' + parsed.sequence) throw new Error();
          versions.push(parsed);
        }
      }
    } catch {
      error = 'corrupt';
    }
    const heads = versions.filter(
      (version) => !versions.some((other) => other !== version && dominates(other, version)),
    );
    if (error === undefined && heads.length >= MAX_VERSIONS) error = 'quota';
    const previous = this.current.get(scope);
    const existing = this.snapshots.get(scope);
    const unsaved = previous?.writer === this.writer && existing?.error !== undefined;
    const persistedSelf = heads.find(
      (version) => version.writer === previous?.writer && version.sequence === previous.sequence,
    );
    const keepPrevious =
      previous !== undefined &&
      (this.editing.has(scope) || persistedSelf !== undefined || error !== undefined || unsaved);
    const selected = keepPrevious ? previous : heads[0];
    if (selected !== undefined) this.current.set(scope, selected);
    const unchanged =
      previous?.writer === selected?.writer && previous?.sequence === selected?.sequence;
    const twins =
      selected === undefined || error !== undefined
        ? []
        : heads.filter(
            (version) =>
              (version.writer !== selected.writer || version.sequence !== selected.sequence) &&
              sameDraft(version, selected),
          );
    this.twins.set(scope, twins);
    const conflicts = heads.filter(
      (version) =>
        !twins.includes(version) &&
        (!unsaved || previous === undefined || !dominates(previous, version)),
    );
    if (
      keepPrevious &&
      !conflicts.some(
        (version) => version.writer === previous.writer && version.sequence === previous.sequence,
      )
    )
      conflicts.unshift(previous);
    this.publish(scope, {
      draft:
        unchanged && existing !== undefined
          ? existing.draft
          : (selected?.draft ?? emptyComposerDraft()),
      versions: conflicts,
      error: error ?? (unsaved ? existing?.error : undefined),
      needsValidation:
        unchanged && existing !== undefined ? existing.needsValidation : selected !== undefined,
      notice: (existing?.notice ?? false) || selected?.notice === true,
    });
  }

  update(scope: string, patch: Partial<ComposerDraft>, resolve = false): void {
    const snapshot = this.read(scope);
    const previous = this.current.get(scope);
    const seen = { ...previous?.seen };
    if (previous !== undefined) seen[previous.writer] = previous.sequence;
    for (const version of this.twins.get(scope) ?? []) {
      for (const [writer, sequence] of Object.entries(version.seen))
        seen[writer] = Math.max(seen[writer] ?? 0, sequence);
      seen[version.writer] = Math.max(seen[version.writer] ?? 0, version.sequence);
    }
    if (resolve)
      for (const version of snapshot.versions) {
        for (const [writer, sequence] of Object.entries(version.seen))
          seen[writer] = Math.max(seen[writer] ?? 0, sequence);
        seen[version.writer] = Math.max(seen[version.writer] ?? 0, version.sequence);
      }
    const own = snapshot.versions.find((version) => version.writer === this.writer);
    const version: Version = {
      writer: this.writer,
      sequence: Math.max(own?.sequence ?? 0, seen[this.writer] ?? 0) + 1,
      seen,
      draft: {
        ...snapshot.draft,
        ...patch,
        ...(patch.text === undefined || patch.skills !== undefined
          ? {}
          : { skills: rebaseSkills(snapshot.draft.text, patch.text, snapshot.draft.skills ?? []) }),
      },
    };
    let error = snapshot.error;
    if (error !== 'corrupt' && (snapshot.versions.length < MAX_VERSIONS || resolve)) {
      try {
        const raw = serialize(version);
        if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) throw new Error();
        parseVersion(raw);
        if (this.storage === undefined) error = 'unavailable';
        else {
          const prefix = PREFIX + encodeURIComponent(scope) + ':';
          this.storage.setItem(prefix + this.writer + ':' + version.sequence, raw);
          error = undefined;
          const obsolete: string[] = [];
          for (let index = 0; index < this.storage.length; index++) {
            const key = this.storage.key(index);
            if (key?.startsWith(prefix) !== true) continue;
            const saved = this.storage.getItem(key);
            if (saved === null) continue;
            const ancestor = parseVersion(saved);
            if (dominates(version, ancestor)) obsolete.push(key);
          }
          for (const key of obsolete) this.storage.removeItem(key);
        }
      } catch {
        error = 'quota';
      }
    } else if (error !== 'corrupt') {
      error = 'quota';
    }
    this.current.set(scope, version);
    this.publish(scope, {
      ...snapshot,
      draft: version.draft,
      error,
      versions: resolve
        ? [version]
        : [...snapshot.versions.filter((other) => !dominates(version, other)), version],
    });
  }

  validated(scope: string, patch: Partial<ComposerDraft>, notice: boolean): void {
    const snapshot = this.read(scope);
    const previous = this.current.get(scope);
    const draft = { ...snapshot.draft, ...patch };
    if (previous !== undefined && serialize({ ...previous, draft }) === serialize(previous)) {
      const version = { ...previous, draft };
      this.current.set(scope, version);
      this.publish(scope, {
        ...snapshot,
        draft,
        versions: snapshot.versions.map((candidate) =>
          candidate.writer === previous.writer && candidate.sequence === previous.sequence
            ? version
            : candidate,
        ),
        needsValidation: false,
        notice,
      });
      return;
    }
    this.update(scope, patch);
    this.publish(scope, { ...this.read(scope), needsValidation: false, notice });
  }

  choose(scope: string, writer: string): void {
    const snapshot = this.read(scope);
    const selected = snapshot.versions.find((version) => version.writer === writer);
    if (selected === undefined) return;
    this.update(scope, selected.draft, true);
    this.publish(scope, { ...this.read(scope), needsValidation: true });
  }
}
