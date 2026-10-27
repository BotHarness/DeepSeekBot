import { useRef, useSyncExternalStore, type ReactElement } from 'react';

import type { MarketplaceEntry } from '../../../core/src/marketplace/client.js';

import type { BridgeActions } from './actions.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketUploadDialog } from './market-upload.js';
import { useMountedResource } from './mounted-resource.js';
import { store } from './store.js';

type Flow = { slug: string; replacing?: MarketplaceEntry | undefined };

let open: Flow | undefined;
const watching = new Map<string, MarketplaceEntry | undefined>();
const listeners = new Set<() => void>();
let owner: object | undefined;

const notify = (): void => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function openShareFlow(slug: string, replacing?: MarketplaceEntry): void {
  open = { slug, replacing };
  notify();
}

export function watchShareDraft(slug: string, replacing?: MarketplaceEntry): void {
  watching.set(slug, replacing);
  notify();
}

function closeShareFlow(): void {
  open = undefined;
  notify();
}

function mountDraftWatch(actions: Pick<BridgeActions, 'shareDraftGet'>): () => void {
  let last = '';
  let checking = false;
  const check = (): void => {
    if (watching.size === 0 || checking) return;
    const { conversation } = store.getSnapshot();
    const key = `${conversation.channel?.id ?? ''}:${conversation.messages.at(-1)?.id ?? ''}`;
    if (key === last) return;
    last = key;
    checking = true;
    void Promise.all(
      [...watching].map(async ([slug, replacing]) => {
        try {
          const draft = await actions.shareDraftGet(slug);
          if (draft === undefined) watching.delete(slug);
          else if (draft.state === 'ready') {
            watching.delete(slug);
            openShareFlow(slug, replacing);
          }
        } catch {}
      }),
    ).finally(() => {
      checking = false;
    });
  };
  return store.subscribe(check);
}

export function ShareFlowHost({
  actions,
  registry,
  t,
}: {
  actions: BridgeActions;
  registry?: Pick<DockPanelRegistry, 'open'> | undefined;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const me = useRef({}).current;
  const snapshot = (): Flow | undefined => (owner === me ? open : undefined);
  const flow = useSyncExternalStore(subscribe, snapshot, snapshot);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (owner !== undefined) return;
    owner = me;
    notify();
    const stop = mountDraftWatch(actions);
    return () => {
      stop();
      owner = undefined;
      notify();
    };
  }, [actions]);
  return (
    <>
      <span ref={mount} hidden />
      {flow === undefined ? null : (
        <MarketUploadDialog
          key={flow.slug}
          actions={actions}
          registry={registry}
          t={t}
          initialSlug={flow.slug}
          replacing={flow.replacing}
          onListed={() => {}}
          onClose={closeShareFlow}
        />
      )}
    </>
  );
}
