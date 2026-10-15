import { RemoteViewer } from '../../../client/src/client/remote-viewer/index.js';
import type { ViewerTranslate } from '../../../client/src/client/remote-viewer/locale.js';
import {
  useId,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
} from 'react';
import {
  Button,
  IconFullscreenOutlineRegular,
  Switch,
  Tag,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { ChannelSidebarIcon } from '../../../client/src/client/channel-sidebar-icon.js';
import { useMountedResource } from '../../../client/src/client/mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from '../../../client/src/client/sidebar-card.js';
import type {} from '@deepseek-ai/dsh-client-ui-slots';

import { LOCALE_NS, en, zh, type BrowserTranslate } from './locale.js';
import {
  BrowserApiError,
  BrowserFailureNotice,
  BrowserProvisionProgress,
  readFailure,
  type BrowserFailure,
} from './browser-failure.js';
import { isBrowserFailureKind } from '../failure-kinds.js';
import { ProfileCombobox } from './profile-combobox.js';
import { registerBrowserSettings } from './settings.js';
import { ProfileBrowserControl } from './profile-browser.js';
import type { ProfileView } from '../profile-control.js';
import { DailyBrowserControl } from './daily-browser.js';
import type { DailyView } from '../daily.js';
import { BorrowedBrowser, type BorrowedTabView } from './borrowed-browser.js';
import { styles } from './styles.js';

const ENTRY_ID = 'botharness-browser';
const OBSERVATION_ENDPOINT = './api/browser/observation';
const TAKEOVER_ENDPOINT = './api/browser/takeover';
const OPEN_ENDPOINT = './api/browser/open';
const STOP_ENDPOINT = './api/browser/stop';
const baseRelative = (path: string | null | undefined): string | undefined =>
  path === null || path === undefined ? undefined : path.startsWith('/') ? `.${path}` : path;

import { AccessPowerIcon } from './access-power-icon.js';
import { TakeoverIcon, TrackpadIcon } from './viewer-icons.js';

export const name = 'botharness-browser-client';

export const inject = ['channelSidebar', 'connection', 'locale'];

export interface BrowserClientContext {
  readonly locale: {
    bind(namespace: string): BrowserTranslate;
    register(namespace: string, dictionaries: { zh: unknown; en: unknown }): () => void;
  };
  inject(names: readonly string[], callback: (ctx: BrowserClientContext) => void): void;
  effect(callback: () => () => void, name: string): void;
}

interface ChannelSidebarEntryProps {
  readonly botSlug?: string;
  readonly t: BrowserTranslate;
  readonly expanded?: boolean;
  readonly setExpanded?: (expanded: boolean) => void;
  readonly setExpandable?: (expandable: boolean) => void;
}

interface ChannelSidebarRegistryLike {
  register(entry: {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly order: number;
    readonly scope: 'channel' | 'personabot';
    readonly component: ComponentType<ChannelSidebarEntryProps>;
    readonly headerAction?: ComponentType<ChannelSidebarEntryProps>;
    readonly badge?: ComponentType<ChannelSidebarEntryProps>;
    readonly tab?: string;
  }): () => void;
}

interface ConnectionRpcLike {
  call(
    path: string,
    method: string,
    options?: { args?: unknown },
  ): Promise<{ ok: boolean; value?: unknown; error?: { message?: string } }>;
}

let connectionRpc: ConnectionRpcLike | undefined;

interface BotInfoView {
  readonly displayName: string | undefined;
  readonly browserAccess: boolean | undefined;
  readonly browserProfile: string | undefined;
  readonly profiles: readonly string[];
}

interface BrowserTabView {
  readonly targetId: string;
  readonly url: string;
  readonly title: string;
  readonly current: boolean;
}

interface BrowserObservation {
  readonly target?: 'local' | 'container' | 'extension' | 'daily-control' | 'profile-control';
  readonly daily?: DailyView | null;
  readonly profile?: ProfileView;
  readonly borrowed?: BorrowedTabView | null;
  readonly viewerUrl?: string | null;
  readonly cleanupRequired?: boolean;
  readonly running: boolean;
  readonly frame: string | null;
  readonly focused: string | null;
  readonly takeover: boolean;
  readonly handoffPending?: boolean;
  readonly provisioning?: { downloadedBytes: number; totalBytes: number } | null;
  readonly tabs: readonly BrowserTabView[];
  readonly profiles?: readonly string[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = (await response.json()) as T & {
    ok?: boolean;
    error?: string;
    code?: string;
    detail?: string;
    packages?: string[];
  };
  if (!response.ok || body.ok === false) {
    throw new BrowserApiError(
      body.error ?? `HTTP ${String(response.status)}`,
      body.code,
      body.detail,
      body.packages,
    );
  }
  return body;
}

interface ReadableStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

type BotInfoStore = ReadableStore<BotInfoView> & {
  refresh(): void;
  setAccess(enabled: boolean): void;
};

const botInfoStores = new Map<string, BotInfoStore>();

function botInfoStore(botSlug: string | undefined): BotInfoStore {
  const key = botSlug ?? '';
  const existing = botInfoStores.get(key);
  if (existing !== undefined) return existing;
  const created = createBotInfoStore(botSlug);
  botInfoStores.set(key, created);
  return created;
}

function createBotInfoStore(botSlug: string | undefined): BotInfoStore {
  let info: BotInfoView = {
    displayName: undefined,
    browserAccess: undefined,
    browserProfile: undefined,
    profiles: [],
  };
  const listeners = new Set<() => void>();
  let loadedAt = Number.NEGATIVE_INFINITY;
  const load = (): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined) return;
    void rpc
      .call('/api', 'botharness/list', { args: {} })
      .then((result) => {
        if (!result.ok) return;
        const value = result.value as {
          bots?: readonly {
            slug?: unknown;
            displayName?: unknown;
            browserAccess?: unknown;
            browserProfile?: unknown;
          }[];
        };
        const bots = value.bots ?? [];
        const match = bots.find((bot) => bot.slug === botSlug);
        if (match === undefined) return;
        const profiles = [
          ...new Set(
            bots
              .map((bot) => (typeof bot.browserProfile === 'string' ? bot.browserProfile : ''))
              .filter((name) => name !== ''),
          ),
        ].sort();
        info = {
          displayName:
            typeof match.displayName === 'string' && match.displayName.length > 0
              ? match.displayName
              : undefined,
          browserAccess: match.browserAccess === true,
          browserProfile:
            typeof match.browserProfile === 'string' && match.browserProfile !== ''
              ? match.browserProfile
              : undefined,
          profiles,
        };
        for (const listener of listeners) listener();
      })
      .catch(() => undefined);
  };
  return {
    setAccess(enabled) {
      info = { ...info, browserAccess: enabled };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      if (listeners.size === 0 && Date.now() - loadedAt > 5000) {
        loadedAt = Date.now();
        load();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => info,
    refresh: load,
  };
}

interface ObservationStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): BrowserObservation | undefined;
  setTab(targetId: string | undefined): void;
  refresh(): void;
  confirmTakeover(active: boolean): void;
}

function observationUrl(botSlug: string | undefined, tabId: string | undefined): string {
  const base = `${OBSERVATION_ENDPOINT}?slug=${encodeURIComponent(botSlug ?? '')}`;
  return tabId === undefined || tabId === '' ? base : `${base}&tab=${encodeURIComponent(tabId)}`;
}

function createObservationStore(botSlug: string | undefined): ObservationStore {
  let value: BrowserObservation | undefined;
  let tab: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let refreshing = false;
  let revision = 0;
  let refreshAgain = false;
  const listeners = new Set<() => void>();
  const refresh = async (): Promise<void> => {
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    const requestedTab = tab;
    const requestedRevision = revision;
    try {
      const next = await requestJson<BrowserObservation>(observationUrl(botSlug, requestedTab));
      if (tab === requestedTab && revision === requestedRevision) value = next;
    } catch {
      if (tab === requestedTab && revision === requestedRevision) value = undefined;
    } finally {
      refreshing = false;
    }
    for (const listener of listeners) listener();
    if (refreshAgain && listeners.size > 0) {
      refreshAgain = false;
      void refresh();
    }
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        void refresh();
        timer = setInterval(() => void refresh(), 1500);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== undefined) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
    getSnapshot: () => value,
    setTab(targetId) {
      tab = targetId;
      void refresh();
    },
    confirmTakeover(active) {
      revision += 1;
      if (value !== undefined) value = { ...value, takeover: active };
      for (const listener of listeners) listener();
    },
    refresh: () => void refresh(),
  };
}

function BrowserHeaderAction({
  botSlug,
  t,
  setExpandable,
  setExpanded,
}: ChannelSidebarEntryProps): ReactElement {
  const store = botInfoStore(botSlug);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState(false);
  const subscribe = (listener: () => void): (() => void) => {
    const sync = (): void => {
      setExpandable?.(store.getSnapshot().browserAccess !== undefined);
    };
    const unsubscribe = store.subscribe(() => {
      sync();
      listener();
    });
    sync();
    return unsubscribe;
  };
  const info = useSyncExternalStore(subscribe, store.getSnapshot);
  const accessOn = info.browserAccess === true;

  const onToggle = (next: boolean): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    void rpc
      .call('/api', 'botharness/browserAccessSet', { args: { slug: botSlug, enabled: next } })
      .then((result) => {
        if (!result.ok) {
          setError(true);
          return;
        }
        const value = result.value as { bot?: { browserAccess?: unknown } };
        const applied = value.bot?.browserAccess === true;
        store.setAccess(applied);
        setExpanded?.(applied);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        inFlight.current = false;
        setBusy(false);
      });
  };

  const label = t(accessOn ? 'entry.access.disable' : 'entry.access.enable');
  return (
    <span className="bh-browser-access-control">
      <Tooltip
        label={error ? t('entry.access.failed') + ': ' + label : label}
        side="bottom"
        delayMs={500}
      >
        <button
          type="button"
          className={`bh-browser-access-power${error ? ' bh-access-failed' : ''}`}
          aria-label={label}
          aria-pressed={accessOn}
          aria-busy={busy}
          disabled={
            busy ||
            botSlug === undefined ||
            connectionRpc === undefined ||
            info.browserAccess === undefined
          }
          onClick={() => onToggle(!accessOn)}
        >
          <AccessPowerIcon />
        </button>
      </Tooltip>
      {error ? (
        <span className="bh-browser-access-error" role="alert" title={t('entry.access.failed')}>
          {t('entry.access.failureHint')}
        </span>
      ) : null}
    </span>
  );
}

function BrowserBody({ botSlug, t }: ChannelSidebarEntryProps): ReactElement {
  const [store] = useState(() => createObservationStore(botSlug));
  const infoStore = botInfoStore(botSlug);
  const observation = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const info = useSyncExternalStore(infoStore.subscribe, infoStore.getSnapshot);
  const [follow, setFollow] = useState(true);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const [profileInvalid, setProfileInvalid] = useState(false);
  const [profileOverride, setProfileOverride] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<BrowserFailure | undefined>(undefined);
  const [viewer, setViewer] = useState<string | undefined>();
  const [interaction, setInteraction] = useState(false);
  const viewerScope = useRef('');
  const previousViewer = useRef<{ identity: string; url: string | undefined }>({
    identity: '',
    url: undefined,
  });
  const mounted = useRef(true);
  const viewerRequest = useRef(0);
  const interactionResource = useCallback((node: HTMLDivElement | null): void => {
    mounted.current = node !== null;
    if (node === null) viewerRequest.current += 1;
  }, []);
  const disableInteraction = useCallback(() => {
    viewerRequest.current += 1;
    setInteraction(false);
  }, []);
  const [inputMode, setInputMode] = useState<'direct' | 'trackpad'>(() =>
    typeof window !== 'undefined' &&
    window.innerWidth < 768 &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
      ? 'trackpad'
      : 'direct',
  );
  const finePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: fine)').matches;
  const showHeaderTakeover = inputMode === 'direct' && finePointer;

  const tabs = observation?.tabs ?? [];
  const focused = observation?.focused ?? null;
  const currentTab = tabs.find((tab) => tab.current);
  const orderedTabs =
    currentTab === undefined ? tabs : [currentTab, ...tabs.filter((tab) => !tab.current)];
  const cleanupRequired = observation?.cleanupRequired === true;
  const failureNotice =
    !cleanupRequired && failure !== undefined && isBrowserFailureKind(failure.code) ? (
      <BrowserFailureNotice
        failure={failure}
        t={t}
        onRetry={() =>
          invoke(OPEN_ENDPOINT, follow || preview === undefined ? {} : { tab: preview })
        }
      />
    ) : null;
  let visibleError: string | undefined = failure?.message;
  if (cleanupRequired) visibleError = t('entry.view.cleanupFailed');
  if (failureNotice !== null) visibleError = undefined;
  const provisioning = observation?.provisioning ?? null;
  const paused = observation?.takeover === true;
  const viewerUrl =
    observation?.running === true &&
    (observation?.target === 'container' || observation?.target === 'local')
      ? baseRelative(observation.viewerUrl)
      : undefined;
  const narrowViewer = typeof window !== 'undefined' && window.innerWidth < 700;
  const viewerDesign =
    observation?.target === 'local' && (inputMode === 'trackpad' || narrowViewer)
      ? { width: 390, height: 700 }
      : { width: 1024, height: 768 };
  const identity = `${botSlug ?? ''}:${profileOverride ?? info.browserProfile ?? ''}:${observation?.target ?? ''}`;
  const scope = `${identity}:${viewerUrl ?? ''}`;
  const previous = previousViewer.current;
  if (viewerScope.current !== scope) {
    viewerScope.current = scope;
    viewerRequest.current += 1;
    previousViewer.current = { identity, url: viewerUrl };
    if (interaction) setInteraction(false);
    if ((previous.identity !== identity || previous.url !== undefined) && viewer !== undefined)
      setViewer(undefined);
  }
  if (!paused && interaction) setInteraction(false);
  const viewerTranslate: ViewerTranslate = (key) => t(key);
  const postTakeoverEnable = (): void => {
    if (botSlug === undefined || viewerUrl === undefined) return;
    const request = ++viewerRequest.current;
    const expectedScope = viewerScope.current;
    setBusy(true);
    setFailure(undefined);
    void requestJson<{ takeover: boolean }>(TAKEOVER_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: botSlug, active: true }),
    })
      .then((result) => {
        if (
          mounted.current &&
          request === viewerRequest.current &&
          viewerScope.current === expectedScope
        ) {
          store.confirmTakeover(result.takeover);
          setInteraction(result.takeover);
        }
      })
      .catch((cause: unknown) => {
        if (mounted.current && request === viewerRequest.current) setFailure(readFailure(cause));
      })
      .finally(() => {
        if (mounted.current) {
          setBusy(false);
          store.refresh();
        }
      });
  };
  const toggleTakeover = (): void => {
    if (interaction) {
      disableInteraction();
      if (observation?.handoffPending !== true) invoke(TAKEOVER_ENDPOINT, { active: false });
      return;
    }
    if (busy || botSlug === undefined || viewerUrl === undefined) return;
    postTakeoverEnable();
  };
  const botName = info.displayName ?? botSlug ?? '';
  const takeoverTitle =
    interaction && paused
      ? `${t('entry.view.browserTitle', { name: botName })} · ${t('entry.takeover.active')}`
      : t('entry.view.browserTitle', { name: botName });
  const toggleRef = useRef(toggleTakeover);
  toggleRef.current = toggleTakeover;
  const messageResource = useMountedResource<HTMLDivElement>(() => {
    const onMessage = (event: MessageEvent): void => {
      const data = event.data as { type?: unknown } | null;
      if (typeof window === 'undefined' || event.origin !== window.location.origin) return;
      if (data === null || typeof data !== 'object' || data.type !== 'bh-takeover-toggle') return;
      const ours = [...document.querySelectorAll('iframe')].some(
        (frame) =>
          frame.contentWindow === event.source &&
          (frame.getAttribute('src') ?? '').includes('/botharness-browser/viewer/'),
      );
      if (!ours) return;
      toggleRef.current();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const takeoverNote = useRef<boolean | undefined>(undefined);
  const wantTakeoverNote = interaction && paused;
  if (takeoverNote.current !== wantTakeoverNote && typeof document !== 'undefined') {
    takeoverNote.current = wantTakeoverNote;
    try {
      for (const frame of Array.from(document.querySelectorAll('iframe'))) {
        if ((frame.getAttribute('src') ?? '').includes('/botharness-browser/viewer/')) {
          frame.contentWindow?.postMessage(
            { type: 'bh-takeover-state', active: wantTakeoverNote },
            window.location.origin,
          );
        }
      }
    } catch {
      void 0;
    }
  }
  const bodyResource = useCallback(
    (node: HTMLDivElement | null): void => {
      interactionResource(node);
      messageResource(node);
    },
    [interactionResource, messageResource],
  );

  const invoke = (endpoint: string, body: Record<string, unknown> = {}): void => {
    if (busy || botSlug === undefined) return;
    setBusy(true);
    setProfileInvalid(false);
    setFailure(undefined);
    void requestJson<{ ok: boolean; viewerUrl?: string | null; takeover?: boolean }>(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: botSlug, ...body }),
    })
      .then((result) => {
        if (typeof result.takeover === 'boolean') store.confirmTakeover(result.takeover);
        if (
          endpoint === OPEN_ENDPOINT &&
          result.viewerUrl !== undefined &&
          result.viewerUrl !== null
        ) {
          setViewer(baseRelative(result.viewerUrl));
          setInteraction(false);
        }
        if (endpoint === STOP_ENDPOINT) {
          setViewer(undefined);
          setInteraction(false);
        }
      })
      .catch((cause: unknown) => setFailure(readFailure(cause)))
      .finally(() => {
        setBusy(false);
        store.refresh();
      });
  };

  const onFollow = (next: boolean): void => {
    setFollow(next);
    if (next) {
      setPreview(undefined);
      store.setTab(undefined);
    } else {
      const selected = focused ?? preview;
      setPreview(selected);
      store.setTab(selected);
    }
  };

  const onSelectTab = (targetId: string): void => {
    setFollow(false);
    setPreview(targetId);
    store.setTab(targetId);
  };

  const onPause = (): void => {
    disableInteraction();
    invoke(TAKEOVER_ENDPOINT, { active: !paused });
  };

  const currentProfile = profileOverride ?? info.browserProfile ?? '';

  const saveProfile = (name: string): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || busy) return;
    const trimmed = name.trim();
    const next = trimmed === 'default' ? '' : trimmed;
    if (next === currentProfile) {
      setProfileInvalid(false);
      setFailure(undefined);
      return;
    }
    disableInteraction();
    setViewer(undefined);
    setBusy(true);
    setProfileInvalid(false);
    setFailure(undefined);
    void rpc
      .call('/api', 'botharness/browserProfileSet', { args: { slug: botSlug, profile: next } })
      .then((result) => {
        if (!result.ok) {
          setProfileInvalid(true);
          setFailure({ message: result.error?.message ?? t('entry.profile.failed') });
          return;
        }
        const value = result.value as { bot?: { browserProfile?: unknown } };
        setProfileOverride(
          typeof value.bot?.browserProfile === 'string' ? value.bot.browserProfile : '',
        );
        setPreview(undefined);
        store.setTab(undefined);
        infoStore.refresh();
      })
      .catch((cause: unknown) => {
        setProfileInvalid(true);
        setFailure(readFailure(cause));
      })
      .finally(() => {
        setBusy(false);
        store.refresh();
      });
  };

  if (!cleanupRequired && observation?.target === 'profile-control')
    return (
      <ProfileBrowserControl
        key={botSlug}
        slug={botSlug}
        view={observation.profile}
        enabled={info.browserAccess === true}
        paused={paused}
        t={t}
        refresh={store.refresh}
      />
    );

  if (!cleanupRequired && observation?.target === 'daily-control')
    return (
      <DailyBrowserControl
        key={botSlug}
        slug={botSlug}
        view={observation.daily ?? null}
        enabled={info.browserAccess === true}
        paused={paused}
        t={t}
        refresh={store.refresh}
      />
    );

  if (!cleanupRequired && observation?.target === 'extension')
    return (
      <BorrowedBrowser
        key={botSlug}
        slug={botSlug}
        tab={observation.borrowed}
        enabled={info.browserAccess === true}
        t={t}
        refresh={store.refresh}
      />
    );

  return (
    <div ref={bodyResource} className="bh-browser-body bh-browser-local">
      <SidebarCardList className="bh-browser-cards">
        <SidebarCardRow
          icon="globe"
          title={t(observation?.target === 'container' ? 'settings.container' : 'settings.local')}
          chips={
            <>
              {observation?.running === true ? (
                <Tag tone="success">{t('entry.chip.running')}</Tag>
              ) : (
                <Tag tone="neutral">{t('entry.chip.stopped')}</Tag>
              )}
              {paused ? <Tag tone="warning">{t('entry.chip.paused')}</Tag> : null}
            </>
          }
          detail={
            <div className="bh-browser-card-detail">
              <div className="bh-browser-card-field">
                <span>{t('entry.profile.label')}</span>
                <ProfileCombobox
                  value={currentProfile}
                  profiles={[...info.profiles, ...(observation?.profiles ?? [])]}
                  disabled={busy || cleanupRequired || botSlug === undefined}
                  invalid={profileInvalid}
                  errorId={errorId}
                  onSelect={saveProfile}
                  t={t}
                />
              </div>
              {viewerUrl === undefined ? (
                <div className="bh-browser-card-field">
                  <span>{t('entry.view.follow')}</span>
                  <Switch
                    checked={follow}
                    onChange={onFollow}
                    label={t('entry.view.follow')}
                    disabled={botSlug === undefined}
                  />
                </div>
              ) : null}
              <div className="bh-browser-actions">
                {viewerUrl === undefined ? (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || cleanupRequired}
                    onClick={() =>
                      invoke(OPEN_ENDPOINT, follow || preview === undefined ? {} : { tab: preview })
                    }
                  >
                    {t(busy ? 'entry.view.opening' : 'entry.view.open')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || cleanupRequired}
                    title={t('entry.view.fullscreen')}
                    onClick={() => {
                      if (viewerUrl !== undefined) setViewer(viewerUrl);
                    }}
                  >
                    <span className="bh-viewer-btn-content">
                      <IconFullscreenOutlineRegular size={14} />
                      <span data-bh-viewer-btn-label>{t('entry.view.fullscreen')}</span>
                    </span>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || cleanupRequired}
                  onClick={onPause}
                >
                  {t(paused ? 'entry.view.resume' : 'entry.view.pause')}
                </Button>
                {observation?.running === true || cleanupRequired ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => invoke(STOP_ENDPOINT)}
                  >
                    {t('entry.view.stop')}
                  </Button>
                ) : null}
              </div>
            </div>
          }
        />
      </SidebarCardList>
      {viewerUrl === undefined ? (
        <>
          {observation?.frame === null || observation?.frame === undefined ? (
            <div className="bh-browser-note">{t('entry.view.noFrame')}</div>
          ) : (
            <img className="bh-browser-frame" src={observation.frame} alt={t('entry.label')} />
          )}
        </>
      ) : (
        <RemoteViewer
          key={scope}
          t={viewerTranslate}
          title={takeoverTitle}
          src={`${viewerUrl}${viewerUrl.includes('?') ? '&' : '?'}mode=${inputMode}`}
          design={viewerDesign}
          notice={
            failure === undefined ? undefined : (
              <div role="alert" className="bh-browser-error">
                {failure.message}
              </div>
            )
          }
          busy={busy}
          stopping={false}
          hideStop
          hideInteractiveToggle
          allowFrameInput
          onStop={() => invoke(STOP_ENDPOINT)}
          interactive={interaction && paused}
          onToggleInteractive={toggleTakeover}
          onDisableInteraction={disableInteraction}
          expanded={viewer === viewerUrl}
          onExpandedChange={(next) => {
            setViewer(next ? viewerUrl : undefined);
            if (!next) disableInteraction();
          }}
          extraControls={
            <>
              {showHeaderTakeover ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  aria-pressed={false}
                  title={t('entry.view.inputMode.trackpad')}
                  onClick={() => setInputMode('trackpad')}
                >
                  <span className="bh-viewer-btn-content">
                    <TrackpadIcon />
                    <span data-bh-viewer-btn-label>{t('entry.view.inputMode.trackpad')}</span>
                  </span>
                </Button>
              ) : null}
              {showHeaderTakeover ? (
                <Button
                  size="sm"
                  variant={interaction ? 'ghost' : 'primary'}
                  disabled={busy}
                  aria-pressed={interaction}
                  title={t(interaction ? 'entry.takeover.stop' : 'entry.takeover.start')}
                  onClick={toggleTakeover}
                >
                  <span className="bh-viewer-btn-content">
                    <TakeoverIcon />
                    <span data-bh-viewer-btn-label>
                      {t(interaction ? 'entry.takeover.stop' : 'entry.takeover.start')}
                    </span>
                  </span>
                </Button>
              ) : null}
            </>
          }
        />
      )}
      {tabs.length === 0 ? (
        <div className="bh-browser-note">{t('entry.view.noTabs')}</div>
      ) : (
        <ul className="bh-card-list bh-browser-tabs" aria-label={t('entry.view.tabs')}>
          {orderedTabs.map((tab) => (
            <li key={tab.targetId} className="bh-card-row">
              <div className="bh-card-line">
                <button
                  type="button"
                  className="bh-card-main bh-browser-tab"
                  aria-current={tab.current ? true : undefined}
                  aria-pressed={tab.targetId === focused}
                  title={tab.url}
                  onClick={() => onSelectTab(tab.targetId)}
                >
                  <span className="bh-card-icon">
                    <ChannelSidebarIcon name="panels-top-left" size={16} />
                  </span>
                  <span className="bh-card-body">
                    <span className="bh-card-title bh-browser-tab-title">
                      {tab.title === '' ? tab.url : tab.title}
                    </span>
                    {tab.title === '' ? null : (
                      <span className="bh-card-meta bh-browser-tab-url">{tab.url}</span>
                    )}
                  </span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {provisioning !== null ? <BrowserProvisionProgress progress={provisioning} t={t} /> : null}
      {failureNotice}
      {visibleError !== undefined ? (
        <div id={errorId} role="alert" className="bh-browser-error">
          {visibleError}
        </div>
      ) : null}
    </div>
  );
}

function createBrowserBody(t: BrowserTranslate): ComponentType<ChannelSidebarEntryProps> {
  return function BrowserBodyView(props: Omit<ChannelSidebarEntryProps, 't'>): ReactElement {
    const store = botInfoStore(props.botSlug);
    const info = useSyncExternalStore(store.subscribe, store.getSnapshot);
    if (info.browserAccess === false)
      return <div className="bh-browser-note">{t('entry.access.description')}</div>;
    return <BrowserBody {...props} t={t} />;
  };
}

function createBrowserBadge(t: BrowserTranslate): ComponentType<ChannelSidebarEntryProps> {
  return function BrowserBadge({ botSlug }: Omit<ChannelSidebarEntryProps, 't'>) {
    const store = botInfoStore(botSlug);
    const info = useSyncExternalStore(store.subscribe, store.getSnapshot);
    if (info.browserAccess !== true) return null;
    return (
      <span className="bh-channel-sidebar-live-dot" role="img" aria-label={t('entry.access.on')} />
    );
  };
}

function createBrowserHeader(t: BrowserTranslate): ComponentType<ChannelSidebarEntryProps> {
  return function BrowserHeaderView(props: Omit<ChannelSidebarEntryProps, 't'>): ReactElement {
    return <BrowserHeaderAction key={props.botSlug} {...props} t={t} />;
  };
}

export function apply(ctx: BrowserClientContext): void {
  botInfoStores.clear();
  const t = ctx.locale.bind(LOCALE_NS);
  registerBrowserSettings(ctx, t);
  ctx.effect(() => {
    const sheet = document.createElement('style');
    sheet.dataset.plugin = '@botharness/browser';
    sheet.dataset.pluginCss = '@botharness/browser/client.css';
    sheet.textContent = styles;
    document.head.append(sheet);
    return () => sheet.remove();
  }, 'botharness-browser: styles');
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'botharness-browser: dictionaries');
  ctx.inject(['channelSidebar', 'connection'], (sidebarCtx) => {
    const registry = (sidebarCtx as unknown as { channelSidebar?: ChannelSidebarRegistryLike })
      .channelSidebar;
    connectionRpc = (sidebarCtx as unknown as { connection?: { rpc?: ConnectionRpcLike } })
      .connection?.rpc;
    if (registry === undefined) return;
    ctx.effect(
      () =>
        registry.register({
          id: ENTRY_ID,
          icon: 'globe',
          label: t('entry.label'),
          order: 41,
          scope: 'personabot',
          component: createBrowserBody(t),
          headerAction: createBrowserHeader(t),
          badge: createBrowserBadge(t),
          tab: 'screen',
        }),
      'botharness-browser: channel sidebar entry',
    );
  });
}
