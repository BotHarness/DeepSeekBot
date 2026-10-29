export const WINDOW_ZOOM_KEY = 'botharness:window-zoom:v1';
export const ZOOM_LEVELS = Array.from({ length: 17 }, (_, index) => index - 8);
export const zoomPercent = (level: number): string => `${Math.round(100 * 1.2 ** level)}%`;
export interface ZoomStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface ZoomDocument {
  version: 1;
  revision: string;
  defaultLevel: number;

  primaryLevel: number;
}
export interface ZoomSnapshot {
  document: ZoomDocument;
  appliedLevel: number | null;
  visibility: 'visible' | 'hidden';
  error: string | null;
}
export type ZoomOperation =
  | { type: 'set'; level: number }
  | { type: 'default'; level: number }
  | { type: 'step'; delta: -1 | 1 }
  | { type: 'reset' };
export class ZoomError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export function validZoomLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= -8 && value <= 8;
}
export function parseZoomDocument(raw: string | null): ZoomDocument {
  if (raw === null) return { version: 1, revision: 'initial', defaultLevel: 0, primaryLevel: 0 };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ZoomError('zoom-storage-invalid');
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('revision' in value) ||
    typeof value.revision !== 'string' ||
    !('defaultLevel' in value) ||
    !validZoomLevel(value.defaultLevel) ||
    !('primaryLevel' in value) ||
    !validZoomLevel(value.primaryLevel)
  )
    throw new ZoomError('zoom-storage-invalid');
  return {
    version: 1,
    revision: value.revision,
    defaultLevel: value.defaultLevel,
    primaryLevel: value.primaryLevel,
  };
}
export function parseZoomOperation(value: unknown): ZoomOperation {
  if (typeof value !== 'object' || value === null || !('type' in value))
    throw new ZoomError('zoom-invalid-operation');
  const keys = Object.keys(value);
  if (value.type === 'reset' && keys.length === 1) return { type: 'reset' };
  if (keys.length !== 2) throw new ZoomError('zoom-invalid-operation');
  if (
    (value.type === 'set' || value.type === 'default') &&
    'level' in value &&
    validZoomLevel(value.level)
  )
    return { type: value.type, level: value.level };
  if (value.type === 'step' && 'delta' in value && (value.delta === 1 || value.delta === -1))
    return { type: 'step', delta: value.delta };
  throw new ZoomError('zoom-invalid-operation');
}
export class WindowZoom {
  #snapshot: ZoomSnapshot = {
    document: parseZoomDocument(null),
    appliedLevel: null,
    visibility: 'visible',
    error: null,
  };
  #listeners = new Set<() => void>();
  constructor(
    private storage: ZoomStorage | undefined,
    private apply: (level: number) => void,
    private revision: () => string = () => crypto.randomUUID(),
  ) {
    this.refresh();
  }
  getSnapshot = (): ZoomSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #publish(patch: Partial<ZoomSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener();
  }
  #read(): ZoomDocument {
    try {
      if (!this.storage) throw new ZoomError('zoom-storage-unavailable');
      return parseZoomDocument(this.storage.getItem(WINDOW_ZOOM_KEY));
    } catch (error) {
      throw error instanceof ZoomError ? error : new ZoomError('zoom-storage-unavailable');
    }
  }
  #render(document: ZoomDocument): void {
    try {
      this.apply(document.primaryLevel);
      this.#publish({ document, appliedLevel: document.primaryLevel, error: null });
    } catch {
      this.#publish({ document, appliedLevel: null, error: 'zoom-apply-failed' });
      throw new ZoomError('zoom-apply-failed');
    }
  }
  refresh = (): void => {
    try {
      this.#render(this.#read());
    } catch (error) {
      this.#publish({
        error: error instanceof ZoomError ? error.code : 'zoom-storage-unavailable',
      });
    }
  };

  visibilityChanged = (visibility: 'visible' | 'hidden'): void => {
    this.#publish({ visibility });
    if (visibility === 'visible') this.refresh();
  };
  execute = (input: unknown, expectedRevision?: string): ZoomSnapshot => {
    try {
      const operation = parseZoomOperation(input);
      const current = this.#read();
      if (expectedRevision !== undefined && expectedRevision !== current.revision)
        throw new ZoomError('zoom-revision-conflict');
      const level =
        operation.type === 'reset'
          ? current.defaultLevel
          : operation.type === 'step'
            ? Math.max(-8, Math.min(8, current.primaryLevel + operation.delta))
            : operation.level;
      const defaultLevel = operation.type === 'default' ? level : current.defaultLevel;
      if (level === current.primaryLevel && defaultLevel === current.defaultLevel) {
        this.#render(current);
        return this.#snapshot;
      }
      const next: ZoomDocument = {
        version: 1,
        revision: this.revision(),
        defaultLevel,
        primaryLevel: level,
      };
      try {
        this.storage!.setItem(WINDOW_ZOOM_KEY, JSON.stringify(next));
      } catch {
        throw new ZoomError('zoom-storage-unavailable');
      }

      this.#render(next);
      return this.#snapshot;
    } catch (error) {
      this.#publish({ error: error instanceof ZoomError ? error.code : 'zoom-operation-failed' });
      throw error;
    }
  };
}
