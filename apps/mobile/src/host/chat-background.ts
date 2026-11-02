export type BackgroundScope = { hostId: string; channelId: string };
export type BackgroundImage = { id: string; width: number; height: number };
export type BackgroundDimensions = { width: number; height: number };
export type BackgroundSource = BackgroundDimensions & { uri: string };
export type BackgroundChoice =
  | { kind: 'default' }
  | { kind: 'color'; color: string }
  | (BackgroundImage & {
      kind: 'image';
      fit: 'cover' | 'contain';
      x: number;
      y: number;
      fade: number;
    });
export type BackgroundDocument = {
  version: 1;
  default: BackgroundChoice;
  overrides: Record<string, BackgroundChoice>;
};
export interface BackgroundPorts {
  read(): Promise<unknown>;
  write(value: BackgroundDocument): Promise<void>;
  importImage(uri: string, dimensions?: BackgroundDimensions): Promise<BackgroundImage>;
  listImages(): Promise<string[]>;
  removeImage(id: string): Promise<void>;
}

const DEFAULT: BackgroundChoice = { kind: 'default' };
const fresh = (): BackgroundDocument => ({ version: 1, default: DEFAULT, overrides: {} });
const scopeKey = (scope: BackgroundScope) => JSON.stringify([scope.hostId, scope.channelId]);
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

export function parseBackground(value: unknown): BackgroundChoice | undefined {
  const row = object(value);
  if (row['kind'] === 'default') return DEFAULT;
  if (
    row['kind'] === 'color' &&
    typeof row['color'] === 'string' &&
    /^#[\da-f]{6}$/iu.test(row['color'])
  )
    return { kind: 'color', color: row['color'].toLowerCase() };
  if (
    row['kind'] === 'image' &&
    typeof row['id'] === 'string' &&
    /^[\w-]+\.jpg$/u.test(row['id']) &&
    finite(row['width'], 1, 16384) &&
    finite(row['height'], 1, 16384) &&
    (row['fit'] === 'cover' || row['fit'] === 'contain') &&
    finite(row['x'], 0, 1) &&
    finite(row['y'], 0, 1) &&
    finite(row['fade'], 0, 100)
  ) {
    return {
      kind: 'image',
      id: row['id'],
      width: row['width'],
      height: row['height'],
      fit: row['fit'],
      x: row['x'],
      y: row['y'],
      fade: row['fade'],
    };
  }
  return undefined;
}

function persistedBackground(value: unknown): BackgroundChoice | undefined {
  const row = object(value);
  if (row['kind'] !== 'image') return parseBackground(value);
  const bounded = (field: string, initial: number, maximum: number) =>
    row[field] === undefined
      ? initial
      : typeof row[field] === 'number' && Number.isFinite(row[field])
        ? Math.max(0, Math.min(maximum, row[field]))
        : row[field];
  return parseBackground({
    ...row,
    fit: row['fit'] ?? 'cover',
    x: bounded('x', 0.5, 1),
    y: bounded('y', 0.5, 1),
    fade: bounded('fade', 60, 100),
  });
}

export function parseBackgroundDocument(value: unknown): BackgroundDocument | undefined {
  const row = object(value);
  if (
    row['version'] !== 1 ||
    !persistedBackground(row['default']) ||
    !row['overrides'] ||
    typeof row['overrides'] !== 'object' ||
    Array.isArray(row['overrides'])
  )
    return undefined;
  const overrides: Record<string, BackgroundChoice> = {};
  for (const [key, choice] of Object.entries(object(row['overrides']))) {
    try {
      const parts: unknown = JSON.parse(key);
      const parsed = persistedBackground(choice);
      if (
        Array.isArray(parts) &&
        parts.length === 2 &&
        parts.every((p) => typeof p === 'string' && p !== '') &&
        parsed
      )
        overrides[key] = parsed;
      else return undefined;
    } catch {
      return undefined;
    }
  }
  return { version: 1, default: persistedBackground(row['default']) ?? DEFAULT, overrides };
}

type EditSnapshot = {
  choice: BackgroundChoice | undefined;
  busy: boolean;
  error: boolean;
  closed: boolean;
};
export interface BackgroundEdit {
  getSnapshot(): EditSnapshot;
  subscribe(listener: () => void): () => void;
  choose(choice: BackgroundChoice | undefined): void;
  pick(uri: string, dimensions?: BackgroundDimensions): Promise<void>;
  save(): Promise<void>;
  cancel(): Promise<void>;
}

export function createChatBackgrounds(ports: BackgroundPorts) {
  let snapshot = { document: fresh(), loaded: false, storageError: false };
  const listeners = new Set<() => void>();
  const drafts = new Set<BackgroundEdit>();
  let importing = 0;
  let saving = false;
  let canCollect = true;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const selected = (scope?: BackgroundScope) =>
    scope === undefined ? snapshot.document.default : snapshot.document.overrides[scopeKey(scope)];
  async function collect() {
    if (!canCollect || !snapshot.loaded || importing > 0 || saving) return;
    const referenced = (id: string) =>
      [
        snapshot.document.default,
        ...Object.values(snapshot.document.overrides),
        ...[...drafts].map((draft) => draft.getSnapshot().choice),
      ].some((choice) => choice?.kind === 'image' && choice.id === id);
    try {
      for (const id of await ports.listImages()) {
        if (!canCollect || importing > 0 || saving) return;
        if (!referenced(id)) await ports.removeImage(id);
      }
    } catch {
      snapshot = { ...snapshot, storageError: true };
      notify();
    }
  }
  const ready = ports
    .read()
    .then(
      (value) => {
        const parsed = value === undefined ? fresh() : parseBackgroundDocument(value);
        canCollect = parsed !== undefined;
        snapshot = { ...snapshot, document: parsed ?? fresh(), storageError: !canCollect };
      },
      () => {
        canCollect = false;
        snapshot = { ...snapshot, storageError: true };
      },
    )
    .then(async () => {
      snapshot = { ...snapshot, loaded: true };
      notify();
      await collect();
    });
  return {
    ready,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resolve(scope?: BackgroundScope): BackgroundChoice {
      return selected(scope) ?? snapshot.document.default;
    },
    edit(scope?: BackgroundScope): BackgroundEdit {
      if (!snapshot.loaded) throw Error('background-not-ready');
      if (scope !== undefined && (!scope.hostId || !scope.channelId))
        throw Error('background-invalid-scope');
      const initial = selected(scope);
      let state: EditSnapshot = { choice: initial, busy: false, error: false, closed: false };
      const observers = new Set<() => void>();
      const update = (patch: Partial<EditSnapshot>) => {
        state = { ...state, ...patch };
        for (const listener of observers) listener();
      };
      const editor: BackgroundEdit = {
        getSnapshot: () => state,
        subscribe(listener) {
          observers.add(listener);
          return () => {
            observers.delete(listener);
          };
        },
        choose(choice) {
          if (state.closed || state.busy) return;
          const parsed = choice === undefined ? undefined : parseBackground(choice);
          if (choice !== undefined && parsed === undefined)
            throw Error('background-invalid-choice');
          update({ choice: scope === undefined ? (parsed ?? DEFAULT) : parsed, error: false });
        },
        async pick(uri, dimensions) {
          if (state.closed || state.busy) return;
          update({ busy: true, error: false });
          importing++;
          try {
            const image = await ports.importImage(uri, dimensions);
            if (!state.closed)
              update({
                choice: { kind: 'image', ...image, fit: 'cover', x: 0.5, y: 0.5, fade: 60 },
              });
          } catch {
            update({ error: true });
            throw Error('background-import-failed');
          } finally {
            importing--;
            update({ busy: false });
            await collect();
          }
        },
        async save() {
          if (state.closed || state.busy || saving) throw Error('background-busy');
          if (!canCollect) {
            update({ error: true });
            throw Error('background-save-failed');
          }
          if (JSON.stringify(initial) !== JSON.stringify(selected(scope))) {
            update({ error: true });
            throw Error('background-stale');
          }
          update({ busy: true, error: false });
          saving = true;
          try {
            const next: BackgroundDocument = {
              ...snapshot.document,
              overrides: { ...snapshot.document.overrides },
            };
            if (scope === undefined) next.default = state.choice ?? DEFAULT;
            else if (state.choice === undefined) delete next.overrides[scopeKey(scope)];
            else next.overrides[scopeKey(scope)] = state.choice;
            await ports.write(next);
            canCollect = true;
            snapshot = { ...snapshot, document: next, storageError: false };
            drafts.delete(editor);
            update({ closed: true });
            notify();
          } catch {
            update({ error: true });
            throw Error('background-save-failed');
          } finally {
            saving = false;
            update({ busy: false });
            await collect();
          }
        },
        async cancel() {
          update({ closed: true });
          drafts.delete(editor);
          await collect();
        },
      };
      drafts.add(editor);
      return editor;
    },
  };
}
