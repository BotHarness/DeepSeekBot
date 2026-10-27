import { useRef, useSyncExternalStore, type ReactElement } from 'react';

import type { BridgeActions } from './actions.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { BotHarnessTranslate } from './locale.js';
import { MarketUploadDialog } from './market-upload.js';
import { useMountedResource } from './mounted-resource.js';
import { store } from './store.js';

let open: string | undefined;
const watching = new Set<string>();
const listeners = new Set<() => void>();
let owner: object | undefined;

const notify = (): void => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function openShareFlow(slug: string): void {
  open = slug;
  notify();
}

export function watchShareDraft(slug: string): void {
  watching.add(slug);
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
      [...watching].map(async (slug) => {
        try {
          const draft = await actions.shareDraftGet(slug);
          if (draft === undefined) watching.delete(slug);
          else if (draft.state === 'ready') {
            watching.delete(slug);
            openShareFlow(slug);
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
  const snapshot = (): string | undefined => (owner === me ? open : undefined);
  const slug = useSyncExternalStore(subscribe, snapshot, snapshot);
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
      {slug === undefined ? null : (
        <MarketUploadDialog
          key={slug}
          actions={actions}
          registry={registry}
          t={t}
          initialSlug={slug}
          onListed={() => {}}
          onClose={closeShareFlow}
        />
      )}
    </>
  );
}
