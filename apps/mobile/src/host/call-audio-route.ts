export type CallAudioRoute = 'speaker' | 'receiver' | 'media';

export type CallAudioEvent = {
  interrupted: boolean;
  output?: string;
  resumed?: boolean;
};

export interface CallAudioControl {
  route(route: CallAudioRoute): string | null;
  onChange(listener: (event: CallAudioEvent) => void): () => void;
}

export const CALL_AUDIO_ROUTES: readonly CallAudioRoute[] = ['speaker', 'receiver', 'media'];

export const DEFAULT_CALL_AUDIO_ROUTE: CallAudioRoute = 'speaker';

export function isCallAudioRoute(value: unknown): value is CallAudioRoute {
  return typeof value === 'string' && (CALL_AUDIO_ROUTES as readonly string[]).includes(value);
}

export type CallAudioRouteSnapshot = {
  readonly route: CallAudioRoute;
  readonly loaded: boolean;
  readonly storageError: boolean;
};

export function createCallAudioRoutePreference(storage: {
  read(): Promise<unknown>;
  write(route: CallAudioRoute): void;
}) {
  let snapshot: CallAudioRouteSnapshot = {
    route: DEFAULT_CALL_AUDIO_ROUTE,
    loaded: false,
    storageError: false,
  };
  let touched = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const persist = () => {
    try {
      storage.write(snapshot.route);
      snapshot = { ...snapshot, storageError: false };
    } catch {
      snapshot = { ...snapshot, storageError: true };
    }
  };
  const ready = storage
    .read()
    .then(
      (value) => {
        if (!touched && isCallAudioRoute(value)) snapshot = { ...snapshot, route: value };
        else if (value !== undefined && !isCallAudioRoute(value))
          snapshot = { ...snapshot, storageError: true };
      },
      () => {
        snapshot = { ...snapshot, storageError: true };
      },
    )
    .then(() => {
      snapshot = { ...snapshot, loaded: true };
      if (touched) persist();
      notify();
    });
  return {
    ready,
    getSnapshot: () => snapshot,
    setRoute(route: CallAudioRoute) {
      touched = true;
      if (route === snapshot.route) return;
      snapshot = { ...snapshot, route };
      if (snapshot.loaded) persist();
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type CallAudioRoutePreference = ReturnType<typeof createCallAudioRoutePreference>;
