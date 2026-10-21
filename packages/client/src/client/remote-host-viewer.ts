import {
  createBrowserViewer,
  type BrowserFrame,
  type BrowserInput,
  type BrowserViewerStatus,
} from '../../../../apps/mobile/src/host/browser-viewer.js';
import { createComputerViewer } from '../../../../apps/mobile/src/host/computer-viewer.js';
import type { HostClient } from '../../../../apps/mobile/src/host/client.js';

export type RemoteViewerKind = 'browser' | 'computer';

export interface RemoteHostViewerState {
  status: BrowserViewerStatus;
  frame?: BrowserFrame;
  control: boolean;
  switching: boolean;
  notice?: string | undefined;
}

export interface RemoteHostViewer {
  getSnapshot(): RemoteHostViewerState;
  subscribe(listener: () => void): () => void;
  setControl(active: boolean): Promise<void>;
  send(input: BrowserInput): Promise<void>;
}

interface ViewerRelease {
  settled: Promise<void>;
  retry(): Promise<void>;
}

const releases = new WeakMap<object, Map<string, ViewerRelease>>();

export function createRemoteHostViewer(
  host: Pick<HostClient, 'api' | 'subscribe' | 'getSnapshot'>,
  kind: RemoteViewerKind,
  slug: string,
): RemoteHostViewer {
  const key = kind === 'computer' ? kind : `${kind}:${slug}`;
  let hostReleases = releases.get(host);
  if (hostReleases === undefined) {
    hostReleases = new Map();
    releases.set(host, hostReleases);
  }
  const barriers = hostReleases;
  const listeners = new Set<() => void>();
  let state: RemoteHostViewerState = { status: 'loading', control: false, switching: false };
  let session:
    | {
        stop(): void;
        control(active: boolean): Promise<void>;
        send(input: BrowserInput): Promise<void>;
      }
    | undefined;
  let unsubscribe: (() => void) | undefined;
  let release: Promise<void> = Promise.resolve();
  let retryRelease = async (): Promise<void> => {};
  const takeoverPath = `/api/${kind}/takeover`;
  const publish = (next: RemoteHostViewerState): void => {
    state = next;
    for (const listener of listeners) listener();
  };
  const start = (): NonNullable<typeof session> => {
    let active = true;
    let requestedControl = false;
    let releaseNeeded = false;
    let releasing = false;
    let inputs: Promise<void> = Promise.resolve();
    const abort = new AbortController();
    const pending = new Set<Promise<unknown>>();
    const client: Pick<HostClient, 'api'> = {
      async api(path, init) {
        if (!active && !(releasing && path === takeoverPath && init?.body?.['active'] === false))
          throw new DOMException('Viewer closed', 'AbortError');
        if (init?.body?.['active'] === true && path === takeoverPath) releaseNeeded = true;
        const taking = path === takeoverPath;
        const signal = taking
          ? init?.signal
          : init?.signal === undefined
            ? abort.signal
            : AbortSignal.any([abort.signal, init.signal]);
        const request = host.api(path, { ...init, ...(signal === undefined ? {} : { signal }) });
        if (taking) pending.add(request);
        try {
          const answer = await request;
          if (!active && !taking) throw new DOMException('Viewer closed', 'AbortError');
          if (taking && init?.body?.['active'] === false && answer.status === 200)
            releaseNeeded = false;
          return answer;
        } finally {
          pending.delete(request);
        }
      },
    };
    const viewer =
      kind === 'browser' ? createBrowserViewer({ client, slug }) : createComputerViewer({ client });
    const releaseControl = async (): Promise<void> => {
      if (!releaseNeeded) return;
      releasing = true;
      try {
        if ('setTakeover' in viewer) await viewer.setTakeover(false);
        else await viewer.setControl(false);
      } finally {
        releasing = false;
      }
    };
    retryRelease = releaseControl;
    const read = (): void => {
      if (!active) return;
      const next = viewer.getState();
      publish({
        status: next.status,
        ...(next.frame === undefined ? {} : { frame: next.frame }),
        control: requestedControl && ('takeover' in next ? next.takeover : next.control),
        switching: state.switching,
        notice: next.notice,
      });
    };
    const stopReading = viewer.subscribe(read);
    void release.then(() => {
      if (active) viewer.start();
    });
    return {
      stop() {
        active = false;
        abort.abort();
        stopReading();
        viewer.stop();
        release = Promise.allSettled([release, ...pending]).then(releaseControl);
        const settled = release;
        barriers.set(key, { settled, retry: releaseControl });
        void settled.then(() => {
          if (!releaseNeeded && barriers.get(key)?.settled === settled) barriers.delete(key);
        });
      },
      async control(value) {
        if (!active || state.switching || (value && state.status !== 'live')) return;
        if (value) requestedControl = true;
        publish({ ...state, switching: true });
        try {
          if ('setTakeover' in viewer) await viewer.setTakeover(value);
          else await viewer.setControl(value);
        } finally {
          if (active) publish({ ...state, switching: false });
        }
      },
      send(input) {
        const next = inputs.then(async () => {
          if (active && state.status === 'live' && state.control && !state.switching)
            await viewer.send(input);
        });
        inputs = next.catch(() => {});
        return next;
      },
    };
  };
  const reconcile = (): void => {
    const connection = host.getSnapshot().connection.status;
    if (connection === 'connected') {
      if (session !== undefined) return;
      publish({ status: 'loading', control: false, switching: false });
      const previous = barriers.get(key);
      release = Promise.allSettled([release, previous?.settled])
        .then(() => previous?.retry())
        .then(retryRelease);
      session = start();
    } else {
      session?.stop();
      session = undefined;
      publish({
        status: connection === 'refused' ? 'refused' : 'unreachable',
        control: false,
        switching: false,
      });
    }
  };
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        unsubscribe = host.subscribe(reconcile);
        reconcile();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size !== 0) return;
        unsubscribe?.();
        unsubscribe = undefined;
        session?.stop();
        session = undefined;
        state = { status: 'loading', control: false, switching: false };
      };
    },
    setControl: (active: boolean) => session?.control(active) ?? Promise.resolve(),
    send: (input: BrowserInput) => session?.send(input) ?? Promise.resolve(),
  };
}
