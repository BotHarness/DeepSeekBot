import { PanelEmptyState } from '../../../client/src/client/ds/empty-state.js';
import { border, color, radius, space, text } from '../../../client/src/client/ds/tokens.stylex.js';
import {
  RemoteViewer,
  type ViewerLifecycleEvent,
} from '../../../client/src/client/remote-viewer/index.js';
import { BH } from '../../../client/src/client/remote-viewer/tokens.js';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import { isExitReport } from './viewer-state.js';
import { reportViewerEvent, viewerEventText } from './viewer-events.js';
import {
  LOCALE_NS,
  PHASE_LABEL,
  en,
  zh,
  type ComputerKey,
  type ComputerTranslate,
} from './locale.js';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from '../../../client/src/client/ds/tooltip.js';
import { SidebarCardList, SidebarCardRow } from '../../../client/src/client/sidebar-card.js';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

import { COMPUTER_SETTINGS_NAMESPACE, type ComputerSettings } from '../settings.js';
import type { ComputerStorage } from '../provider.js';
import {
  ComputerSettingsPrefs,
  ComputerSettingsRows,
  createComputerSettingsFace,
  type ComputerSettingsScope,
} from './settings-rows.js';
import { LocalComputerStatus } from './local-computer.js';
import { useMountedResource } from './mounted-resource.js';

import { AccessPowerIcon } from './access-power-icon.js';
import { STYLEX_CSS } from '../../../client/src/client/ds/stylex-css.js';

const ACCESS_STYLE = `
.bh-computer-access-control { position: relative; display: flex; align-items: center; }
.bh-computer-access-power {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: ${radius.md}; background: transparent;
  color: ${color.muted}; cursor: pointer;
}
.bh-computer-access-power:hover { background: ${color.hover}; }
.bh-computer-access-power[aria-pressed='true'] { color: ${color.accent}; background: ${color.hover}; }
.bh-computer-access-power:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: 2px; }
.bh-computer-access-power:disabled { opacity: 0.5; cursor: default; }
.bh-computer-access-power.bh-access-failed { color: ${color.danger}; }
.bh-computer-access-error { order: -1; padding: 0 ${space.x2}; color: ${color.danger}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; }

`;

export const name = 'botharness-computer-client';

export const inject = ['slots', 'channelSidebar', 'connection', 'locale'];

const STATUS_ENDPOINT = './api/computer/status';
const START_ENDPOINT = './api/computer/start';
const STOP_ENDPOINT = './api/computer/stop';
const VIEWER_SRC = './botharness-computer/viewer/';
const APPROVED_KEY = 'botharness-computer-start-approved';
const ENTRY_ID = 'botharness-computer';

type ComputerState = 'absent' | 'stopped' | 'running' | 'failed';
type ComputerPhase =
  | 'idle'
  | 'pulling'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'exporting'
  | 'importing'
  | 'failed';

interface ComputerProgress {
  readonly percent?: number;
  readonly text?: string;
  readonly updatedAt?: number;
}

interface ComputerStatusPayload {
  readonly target?: 'local' | 'container';
  resolution?: string;
  readonly provider: string | null;
  readonly probe: { readonly available: boolean; readonly detail?: string };
  readonly exportDir?: string;
  readonly status: {
    readonly state: ComputerState;
    readonly phase?: ComputerPhase;
    readonly detail?: string;
    readonly progress?: ComputerProgress;
    readonly storage?: ComputerStorage;
  };
}

interface ChannelSidebarEntryProps {
  readonly scope: 'channel' | 'personabot';
  readonly channelId: string;
  readonly botSlug: string | undefined;
  readonly actions: unknown;
  readonly setExpanded?: (expanded: boolean) => void;
  readonly setExpandable?: (expandable: boolean) => void;
}

interface ConnectionRpcLike {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly error: { readonly message?: string } }
  >;
}

let connectionRpc: ConnectionRpcLike | undefined;

interface ChannelSidebarRegistryLike {
  register(entry: {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly order?: number;
    readonly scope: 'channel' | 'personabot';
    readonly component: ComponentType<ChannelSidebarEntryProps>;
    readonly headerAction?: ComponentType<ChannelSidebarEntryProps>;
    readonly badge?: ComponentType<ChannelSidebarEntryProps>;
    readonly tab?: string;
  }): () => void;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
  return (await response.json()) as T;
}

const SETUP_GUIDANCE_KEY: ComputerKey = 'entry.setup';

const SHARED_NOTE_KEY: ComputerKey = 'entry.shared';

const AUTHORIZATION_POINTS: readonly ComputerKey[] = [
  'entry.authorize.probe',
  'entry.authorize.volume',
  'entry.authorize.pull',
  'entry.authorize.bind',
];

const noteStyle: CSSProperties = { opacity: 0.7, fontSize: 12, whiteSpace: 'pre-wrap' };
const buttonStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: `1px solid ${BH.borderL3}`,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
};
const terminalStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  opacity: 0.7,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

function designOf(resolution: string | undefined): { width: number; height: number } {
  const match = /^(\d{2,5})x(\d{2,5})$/u.exec(resolution ?? '');
  if (match === null) return { width: DESIGN_WIDTH, height: DESIGN_HEIGHT };
  return { width: Number(match[1]), height: Number(match[2]) };
}

export interface RecentLogRow {
  readonly id: number;
  readonly ts: number;
  readonly plugin: string;
  readonly owner: string;
  readonly kind: string;
  readonly detail: string;
}

export function RecentLogsList({
  entries,
}: {
  readonly entries: readonly RecentLogRow[];
}): ReactElement {
  return (
    <div style={terminalStyle}>
      {entries.map((entry) => (
        <div key={entry.id}>
          {new Date(entry.ts).toLocaleTimeString()} [{entry.kind}] {entry.detail}
        </div>
      ))}
    </div>
  );
}

export function RecentLogs({ t }: { readonly t: ComputerTranslate }): ReactElement {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<readonly RecentLogRow[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const loadResource = useMountedResource<HTMLSpanElement>(() => {
    const controller = new AbortController();
    requestJson<{ entries: RecentLogRow[] }>('./api/computer/logs?limit=10', {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setEntries(result.entries);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <div>
      {open && entries === undefined && !failed ? <span hidden ref={loadResource} /> : null}
      <button type="button" onClick={() => setOpen(!open)} style={buttonStyle}>
        {t('entry.recentLogs')}
      </button>
      {open ? (
        failed ? (
          <div style={noteStyle}>{t('entry.recentLogs.failed')}</div>
        ) : entries === undefined ? (
          <div style={noteStyle}>…</div>
        ) : entries.length === 0 ? (
          <div style={noteStyle}>{t('entry.recentLogs.empty')}</div>
        ) : (
          <RecentLogsList entries={entries} />
        )
      ) : null}
    </div>
  );
}

export {
  ScreenIndicator,
  StreamOverlay,
  ViewerTitleBar,
} from '../../../client/src/client/remote-viewer/index.js';

function RunningCard({
  t,
  botSlug,
  busy,
  stopping,
  resolution,
  onStop,
}: {
  readonly t: ComputerTranslate;
  readonly botSlug: string | undefined;
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly resolution?: string;
  readonly onStop: () => void;
}): ReactElement {
  const onEvent = useCallback((event: ViewerLifecycleEvent) => {
    void reportViewerEvent(undefined, viewerEventText(event));
  }, []);
  return (
    <RemoteViewer
      t={t}
      title={t('entry.screen.title', { name: botSlug ?? 'PersonaBot' })}
      src={VIEWER_SRC}
      design={designOf(resolution)}
      busy={busy}
      stopping={stopping}
      onStop={onStop}
      footer={<RecentLogs t={t} />}
      onEvent={onEvent}
    />
  );
}

export interface ComputerEntryViewProps {
  readonly t: ComputerTranslate;
  readonly state: ComputerState;
  readonly phase?: ComputerPhase;
  readonly detail?: string;
  readonly progress?: ComputerProgress;
  readonly runtimeAvailable: boolean;
  readonly confirming: boolean;
  readonly busy: boolean;
  readonly elapsed: number;
  readonly nowTs: number;
  readonly error?: string;
  readonly botSlug?: string;
  readonly storage?: ComputerStorage;
  readonly resolution?: string;
  readonly onStart: () => void;
  readonly onConfirmStart: () => void;
  readonly onStop: () => void;
  readonly onApprove: (remember: boolean) => void;
  readonly onCancel: () => void;
}

export function ComputerEntryView(props: ComputerEntryViewProps): ReactElement {
  const {
    t,
    state,
    phase,
    detail,
    progress,
    runtimeAvailable,
    confirming,
    busy,
    elapsed,
    nowTs,
    error,
    botSlug,
    storage,
    resolution,
    onStart,
    onConfirmStart,
    onStop,
    onApprove,
    onCancel,
  } = props;

  const title = t('rows.target.container');
  const card = (
    chip: ReactElement,
    rest: { meta?: ReactNode; detail?: ReactNode },
  ): ReactElement => (
    <SidebarCardList className="bh-computer-cards">
      <SidebarCardRow icon="monitor" title={title} chips={chip} {...rest} />
    </SidebarCardList>
  );

  if (!runtimeAvailable) {
    return card(<Tag tone="warning">{t('entry.chip.setup')}</Tag>, {
      detail: <div style={noteStyle}>{t(SETUP_GUIDANCE_KEY)}</div>,
    });
  }

  if (confirming) {
    return card(<Tag tone="warning">{t('entry.chip.authorize')}</Tag>, {
      detail: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          <div style={{ opacity: 0.8 }}>{t('entry.authorizeIntro')}</div>
          <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6, opacity: 0.85 }}>
            {AUTHORIZATION_POINTS.map((point) => (
              <li key={point}>{t(point)}</li>
            ))}
          </ul>
          {storage === undefined ? null : (
            <div style={{ opacity: 0.85 }}>
              {t('entry.authorize.storage', { target: storage.target })}
              {storage.ignoredReason === undefined ? '' : `（${storage.ignoredReason}）`}
            </div>
          )}
          {storage?.migrationHint === undefined ? null : (
            <div style={{ opacity: 0.85 }}>{storage.migrationHint}</div>
          )}
          {storage?.kind === 'bind' ? (
            <div style={{ opacity: 0.85 }}>{t('entry.authorize.storageBindRisk')}</div>
          ) : null}
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.85 }}>
            <input type="checkbox" onChange={(event) => onApprove(event.target.checked)} />
            {t('entry.remember')}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="outline" onClick={onCancel}>
              {t('entry.cancel')}
            </Button>
            <Button size="sm" variant="primary" onClick={onConfirmStart}>
              {t('entry.authorize')}
            </Button>
          </div>
        </div>
      ),
    });
  }

  const inProgress =
    phase === 'pulling' ||
    phase === 'starting' ||
    phase === 'stopping' ||
    phase === 'exporting' ||
    phase === 'importing';

  if (state === 'running') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {card(<Tag tone="success">{t('entry.chip.running')}</Tag>, {
          meta: t('entry.screen.title', { name: botSlug ?? 'PersonaBot' }),
        })}
        <RunningCard
          t={t}
          botSlug={botSlug}
          busy={busy}
          stopping={phase === 'stopping'}
          {...(resolution === undefined ? {} : { resolution })}
          onStop={onStop}
        />
      </div>
    );
  }

  if (inProgress) {
    return card(<Tag tone="info">{t(PHASE_LABEL[phase] ?? 'entry.phase.working')}</Tag>, {
      meta: (
        <span>
          {t('entry.elapsed', { seconds: elapsed })}
          {progress?.updatedAt === undefined
            ? ''
            : ` · ${t('entry.updated', {
                seconds: Math.max(0, Math.round((nowTs - progress.updatedAt) / 1000)),
              })}`}
        </span>
      ),
      detail: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              height: 6,
              borderRadius: 3,
              background: BH.borderL4,
            }}
          >
            <div
              style={
                progress?.percent === undefined
                  ? {
                      position: 'absolute',
                      inset: 0,
                      background: BH.businessPrimary,
                    }
                  : {
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: `${String(progress.percent)}%`,
                      background: BH.businessPrimary,
                    }
              }
            />
          </div>
          <div style={terminalStyle}>{progress?.text ?? detail ?? t('entry.wait')}</div>
        </div>
      ),
    });
  }

  const failed = error !== undefined || state === 'failed';
  return card(
    failed ? (
      <Tag tone="danger">{t('entry.chip.failed')}</Tag>
    ) : (
      <Tag tone="neutral">{t('entry.chip.stopped')}</Tag>
    ),
    {
      meta: (
        <span style={{ whiteSpace: 'pre-wrap' }}>
          {error ?? (isExitReport(detail) ? undefined : detail) ?? t(SHARED_NOTE_KEY)}
        </span>
      ),
      detail: (
        <Button size="sm" variant="primary" disabled={busy} onClick={onStart}>
          {busy ? t('entry.starting') : t('entry.start')}
        </Button>
      ),
    },
  );
}

export function createComputerEntry(
  t: ComputerTranslate,
): (props: ChannelSidebarEntryProps) => ReactElement {
  return function ComputerEntryWithLocale(props: ChannelSidebarEntryProps): ReactElement {
    const { computerAccess } = useBotInfo(props.botSlug);
    if (computerAccess === false)
      return <PanelEmptyState icon="monitor">{t('entry.access.description')}</PanelEmptyState>;
    return <ComputerEntry {...props} t={t} />;
  };
}

export function createComputerBadge(
  t: ComputerTranslate,
): (props: ChannelSidebarEntryProps) => ReactElement | null {
  return function ComputerBadge({ botSlug }: ChannelSidebarEntryProps): ReactElement | null {
    const { computerAccess } = useBotInfo(botSlug);
    if (computerAccess !== true) return null;
    return (
      <span className="bh-channel-sidebar-live-dot" role="img" aria-label={t('entry.access.on')} />
    );
  };
}

interface BotInfo {
  readonly displayName: string | undefined;
  readonly computerAccess: boolean | undefined;
}

interface ReadableStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

const botInfoStores = new Map<
  string,
  ReadableStore<BotInfo> & { setAccess(enabled: boolean): void }
>();

function botInfoStore(
  botSlug: string | undefined,
): ReadableStore<BotInfo> & { setAccess(enabled: boolean): void } {
  const key = botSlug ?? '';
  const existing = botInfoStores.get(key);
  if (existing !== undefined) return existing;
  const created = createBotInfoStore(botSlug);
  botInfoStores.set(key, created);
  return created;
}

function createBotInfoStore(
  botSlug: string | undefined,
): ReadableStore<BotInfo> & { setAccess(enabled: boolean): void } {
  let info: BotInfo = { displayName: undefined, computerAccess: undefined };
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
          bots?: readonly { slug?: unknown; displayName?: unknown; computerAccess?: unknown }[];
        };
        const match = (value.bots ?? []).find((bot) => bot.slug === botSlug);
        if (match === undefined) return;
        info = {
          displayName:
            typeof match.displayName === 'string' && match.displayName.length > 0
              ? match.displayName
              : undefined,
          computerAccess: match.computerAccess === true,
        };
        for (const listener of listeners) listener();
      })
      .catch(() => undefined);
  };
  return {
    setAccess(enabled) {
      info = { ...info, computerAccess: enabled };
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
  };
}

function useBotInfo(botSlug: string | undefined): BotInfo {
  const store = botInfoStore(botSlug);
  const info = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { displayName: info.displayName ?? botSlug, computerAccess: info.computerAccess };
}

function ComputerHeaderAction({
  botSlug,
  t,
  setExpandable,
  setExpanded,
}: ChannelSidebarEntryProps & { t: ComputerTranslate }): ReactElement {
  const store = botInfoStore(botSlug);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState(false);
  const subscribe = (listener: () => void): (() => void) => {
    const sync = (): void => {
      setExpandable?.(store.getSnapshot().computerAccess !== undefined);
    };
    const unsubscribe = store.subscribe(() => {
      sync();
      listener();
    });
    sync();
    return unsubscribe;
  };
  const info = useSyncExternalStore(subscribe, store.getSnapshot);
  const accessOn = info.computerAccess === true;

  const onToggle = (next: boolean): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    void rpc
      .call('/api', 'botharness/computerAccessSet', { args: { slug: botSlug, enabled: next } })
      .then((result) => {
        if (!result.ok) {
          setError(true);
          return;
        }
        const value = result.value as { bot?: { computerAccess?: unknown } };
        const applied = value.bot?.computerAccess === true;
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
    <span className="bh-computer-access-control">
      <Tooltip
        label={error ? t('entry.access.failed') + ': ' + label : label}
        side="bottom"
        delayMs={500}
      >
        <button
          type="button"
          className={`bh-computer-access-power${error ? ' bh-access-failed' : ''}`}
          aria-label={label}
          aria-pressed={accessOn}
          aria-busy={busy}
          disabled={
            busy ||
            botSlug === undefined ||
            connectionRpc === undefined ||
            info.computerAccess === undefined
          }
          onClick={() => onToggle(!accessOn)}
        >
          <AccessPowerIcon />
        </button>
      </Tooltip>
      {error ? (
        <span className="bh-computer-access-error" role="alert" title={t('entry.access.failed')}>
          {t('entry.access.failureHint')}
        </span>
      ) : null}
    </span>
  );
}

export function createComputerHeader(
  t: ComputerTranslate,
): (props: ChannelSidebarEntryProps) => ReactElement {
  return function ComputerHeaderWithLocale(props: ChannelSidebarEntryProps): ReactElement {
    return <ComputerHeaderAction key={props.botSlug} {...props} t={t} />;
  };
}

function ComputerEntry({
  botSlug,
  t,
}: ChannelSidebarEntryProps & { t: ComputerTranslate }): ReactElement {
  const { displayName } = useBotInfo(botSlug);
  const [payload, setPayload] = useState<ComputerStatusPayload | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approved, setApproved] = useState(
    () => globalThis.sessionStorage?.getItem(APPROVED_KEY) === '1',
  );
  const [elapsed, setElapsed] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await requestJson<ComputerStatusPayload>(
        STATUS_ENDPOINT,
        signal === undefined ? undefined : { signal },
      );
      if (signal?.aborted) return;
      setPayload(next);
      setError(undefined);
    } catch (cause) {
      if (!signal?.aborted) setError(String(cause));
    }
  }, []);

  const statusResource = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    let pending = false;
    const poll = async (): Promise<void> => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);

  const phase = payload?.status.phase;
  const inProgress =
    phase === 'pulling' ||
    phase === 'starting' ||
    phase === 'stopping' ||
    phase === 'exporting' ||
    phase === 'importing';

  const progressResource = useMountedResource<HTMLSpanElement>(() => {
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setNowTs(Date.now());
      setElapsed(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [inProgress]);

  const act = useCallback(
    async (endpoint: string) => {
      setBusy(true);
      try {
        await requestJson(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            authorize: true,
            ...(endpoint === START_ENDPOINT && typeof navigator !== 'undefined'
              ? { language: navigator.language }
              : {}),
          }),
        });
        await refresh();
      } catch (cause) {
        setError(String(cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const onStart = useCallback(() => {
    if (!approved) {
      setConfirming(true);
      return;
    }
    void act(START_ENDPOINT);
  }, [act, approved]);

  const onConfirmStart = useCallback(() => {
    setConfirming(false);
    void act(START_ENDPOINT);
  }, [act]);

  const onApprove = useCallback((remember: boolean) => {
    if (remember) {
      globalThis.sessionStorage?.setItem(APPROVED_KEY, '1');
      setApproved(true);
    }
  }, []);

  return (
    <div ref={statusResource} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {inProgress ? <span hidden ref={progressResource} /> : null}
      {payload?.target === 'local' ? (
        <LocalComputerStatus t={t} />
      ) : (
        <ComputerEntryView
          t={t}
          state={payload?.status.state ?? 'absent'}
          {...(phase === undefined ? {} : { phase })}
          {...(payload?.status.detail === undefined ? {} : { detail: payload.status.detail })}
          {...(payload?.status.progress === undefined ? {} : { progress: payload.status.progress })}
          runtimeAvailable={payload?.probe.available ?? true}
          confirming={confirming}
          busy={busy}
          elapsed={elapsed}
          nowTs={nowTs}
          {...(error === undefined ? {} : { error })}
          {...(displayName === undefined ? {} : { botSlug: displayName })}
          {...(payload?.status.storage === undefined ? {} : { storage: payload.status.storage })}
          {...(payload?.resolution === undefined ? {} : { resolution: payload.resolution })}
          onStart={onStart}
          onConfirmStart={onConfirmStart}
          onStop={() => void act(STOP_ENDPOINT)}
          onApprove={onApprove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function apply(ctx: ClientContext): void {
  botInfoStores.clear();
  const settingsPrefs = new ComputerSettingsPrefs();
  ctx.inject(['configForms'], (settingsCtx) => {
    const scope = settingsCtx.configForms.get<ComputerSettings>(
      COMPUTER_SETTINGS_NAMESPACE,
    ) as unknown as ComputerSettingsScope;
    const release = settingsPrefs.attach(scope);
    return () => {
      release();
    };
  });
  ctx.inject(['uiWorkspace', 'slots'], (workspaceCtx) => {
    const workspace = (
      workspaceCtx as unknown as { uiWorkspace?: { pickDirectory?: () => Promise<string | null> } }
    ).uiWorkspace;
    const face = createComputerSettingsFace({
      prefs: settingsPrefs,
      pickDirectory: workspace?.pickDirectory?.bind(workspace),
    });
    workspaceCtx.slots.inject('botharness.settings.section', () =>
      workspaceCtx.slots.register(
        {
          name: 'botharness.settings.section',
          id: 'computer',
          order: 30,
          label: () => t('section.title'),
          locale: LOCALE_NS,
          inject: () => face,
        },
        ComputerSettingsRows,
      ),
    );
  });
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    const style = document.createElement('style');
    style.setAttribute('data-botharness-computer', 'client');
    style.dataset.plugin = '@botharness/computer';
    style.dataset.pluginCss = '@botharness/computer/client.css';
    style.textContent = ACCESS_STYLE + STYLEX_CSS;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, 'botharness-computer: client styles');
  const t = ctx.locale.bind(LOCALE_NS);
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'botharness-computer: dictionaries');
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
          icon: 'monitor',
          label: t('entry.label'),
          order: 40,
          scope: 'personabot',
          component: createComputerEntry(t),
          headerAction: createComputerHeader(t),
          badge: createComputerBadge(t),
          tab: 'screen',
        }),
      'botharness-computer: channel sidebar entry',
    );
  });
}
