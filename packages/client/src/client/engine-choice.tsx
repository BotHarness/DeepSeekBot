import { useRef, useState, type ReactElement } from 'react';

import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import type { BotHarnessTranslate } from './locale.js';
import { ModelBrandIcon } from './model-brand.js';
import { useMountedResource } from './mounted-resource.js';
import { engineName } from './session-engine.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

export type EngineId = 'codex' | 'claude';
export type EngineRole = 'orchestrator' | 'assignment';

export type EngineUnavailableReason =
  | 'host-not-local'
  | 'not-installed'
  | 'signed-out'
  | 'not-subscription'
  | 'login-unknown';

export type EngineStatusView = {
  engine: EngineId;
  installed: boolean;
  version?: string;
} & ({ available: true } | { available: false; reason: EngineUnavailableReason });

export interface EngineSelectionView {
  botSlug: string;
  role: EngineRole;
  engine: EngineId;
}

export interface EnginesView {
  engines: EngineStatusView[];
  selections: EngineSelectionView[];
}

export interface EngineApi {
  read(): Promise<EnginesView>;
  use(bot: string, role: EngineRole, engine: EngineId | null): Promise<void>;
  login(engine: EngineId): Promise<{ url?: string }>;
}

const ENGINES = './api/botharness/engines';
const ENGINE_IDS: readonly string[] = ['codex', 'claude'];
const ROLES: readonly string[] = ['orchestrator', 'assignment'];
const REASONS: readonly string[] = [
  'host-not-local',
  'not-installed',
  'signed-out',
  'not-subscription',
  'login-unknown',
];

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function parseStatus(value: unknown): EngineStatusView | undefined {
  const entry = record(value);
  const engine = entry?.['engine'];
  if (entry === undefined || typeof engine !== 'string' || !ENGINE_IDS.includes(engine))
    return undefined;
  const base = {
    engine: engine as EngineId,
    installed: entry['installed'] === true,
    ...(typeof entry['version'] === 'string' ? { version: entry['version'] } : {}),
  };
  if (entry['available'] === true) return { ...base, available: true };
  const reason = entry['reason'];
  return {
    ...base,
    available: false,
    reason:
      typeof reason === 'string' && REASONS.includes(reason)
        ? (reason as EngineUnavailableReason)
        : 'login-unknown',
  };
}

export function parseEngines(value: unknown): EnginesView {
  const body = record(value);
  const engines = body?.['engines'];
  const selections = body?.['selections'];
  if (!Array.isArray(engines) || !Array.isArray(selections))
    throw new Error('Invalid Subscription Engine status');
  return {
    engines: engines.flatMap((entry) => parseStatus(entry) ?? []),
    selections: selections.flatMap((value): EngineSelectionView[] => {
      const entry = record(value);
      const engine = entry?.['engine'];
      const role = entry?.['role'];
      return entry !== undefined &&
        typeof entry['botSlug'] === 'string' &&
        typeof engine === 'string' &&
        ENGINE_IDS.includes(engine) &&
        typeof role === 'string' &&
        ROLES.includes(role)
        ? [{ botSlug: entry['botSlug'], role: role as EngineRole, engine: engine as EngineId }]
        : [];
    }),
  };
}

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(ENGINES, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (response.ok) return parsed;
  const message = (parsed['error'] as { message?: unknown } | undefined)?.message;
  throw new Error(typeof message === 'string' ? message : `HTTP ${response.status}`);
}

export const engineApi: EngineApi = {
  async read() {
    const response = await fetch(ENGINES, {
      credentials: 'include',
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseEngines(await response.json());
  },
  async use(bot, role, engine) {
    await post({ action: 'use', bot, role, engine });
  },
  async login(engine) {
    const result = await post({ action: 'login', engine });
    return typeof result['url'] === 'string' ? { url: result['url'] } : {};
  },
};

const ENGINE_BRANDS = { codex: 'openai', claude: 'claude' } as const;
const SIGN_IN_POLL_MS = 3000;
const SIGN_IN_POLL_DEADLINE_MS = 3 * 60_000;

function statusText(status: EngineStatusView, t: BotHarnessTranslate): string {
  if (status.available)
    return status.version === undefined
      ? t('engine.signedIn')
      : t('engine.signedInVersion', { version: status.version });
  switch (status.reason) {
    case 'not-installed':
      return t('engine.notInstalled', { engine: engineName(status.engine) });
    case 'not-subscription':
      return t('engine.notSubscription');
    case 'login-unknown':
      return t('engine.loginUnknown');
    case 'signed-out':
    case 'host-not-local':
      return t('engine.signedOut');
  }
}

export function EngineChoice({
  slug,
  role,
  t,
  api = engineApi,
  onChange,
}: {
  slug: string;
  role: EngineRole;
  t: BotHarnessTranslate;
  api?: EngineApi;
  onChange?: ((engine: EngineId | undefined) => void) | undefined;
}): ReactElement {
  const [view, setView] = useState<EnginesView>();
  const [busy, setBusy] = useState<EngineId | 'clear'>();
  const [signingIn, setSigningIn] = useState<EngineId>();
  const [error, setError] = useState<string>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [signInUrl, setSignInUrl] = useState<string>();
  const alive = useRef(true);
  const generation = useRef(0);
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = (): Promise<EnginesView | undefined> => {
    const current = generation.current;
    return api.read().then(
      (next) => {
        if (!alive.current || generation.current !== current) return undefined;
        setView(next);
        setLoadFailed(false);
        return next;
      },
      () => {
        if (alive.current && generation.current === current) setLoadFailed(true);
        return undefined;
      },
    );
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      clearTimeout(poll.current);
    };
  }, [slug]);

  if (view === undefined)
    return (
      <div ref={mount} data-engine-choice={role}>
        {loadFailed ? <Note tone="warning">{t('engine.loadFailed')}</Note> : null}
      </div>
    );

  const selected = view.selections.find(
    (entry) => entry.botSlug === slug && entry.role === role,
  )?.engine;

  const choose = (engine: EngineId | null): void => {
    generation.current += 1;
    setBusy(engine ?? 'clear');
    setError(undefined);
    api
      .use(slug, role, engine)
      .then(
        () =>
          refresh().then((next) => {
            if (next !== undefined) onChange?.(engine ?? undefined);
          }),
        (cause: unknown) => {
          if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
        },
      )
      .finally(() => {
        if (alive.current) setBusy(undefined);
      });
  };

  const signIn = (engine: EngineId): void => {
    const tab = window.open('', '_blank');
    setSigningIn(engine);
    setSignInUrl(undefined);
    setError(undefined);
    api.login(engine).then(
      ({ url }) => {
        if (url === undefined) tab?.close();
        else if (tab === null || tab.closed) setSignInUrl(url);
        else {
          tab.opener = null;
          tab.location.href = url;
        }
        const deadline = Date.now() + SIGN_IN_POLL_DEADLINE_MS;
        const check = (): void => {
          void refresh().then((next) => {
            if (!alive.current) return;
            const ready = next?.engines.find((entry) => entry.engine === engine)?.available;
            if (ready === true || Date.now() >= deadline) {
              setSigningIn(undefined);
              if (ready === true) setSignInUrl(undefined);
            } else poll.current = setTimeout(check, SIGN_IN_POLL_MS);
          });
        };
        poll.current = setTimeout(check, SIGN_IN_POLL_MS);
      },
      (cause: unknown) => {
        tab?.close();
        if (!alive.current) return;
        setSigningIn(undefined);
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  const heading = (
    <div className="bh-model-picker-heading">
      <strong>{t('engine.title')}</strong>
      <span>
        {t(role === 'orchestrator' ? 'engine.orchestratorHint' : 'engine.assignmentHint')}
      </span>
    </div>
  );

  if (view.engines.length === 0)
    return (
      <div
        ref={mount}
        className="bh-model-picker"
        role="group"
        aria-label={t('engine.title')}
        data-engine-choice={role}
      >
        {heading}
        <Note>{t('engine.localOnly')}</Note>
      </div>
    );

  return (
    <div
      ref={mount}
      className="bh-model-picker"
      role="group"
      aria-label={t('engine.title')}
      data-engine-choice={role}
    >
      {heading}
      <SidebarCardList label={t('engine.title')}>
        {view.engines.map((status) => {
          const name = engineName(status.engine);
          const checked = selected === status.engine;
          const canSignIn =
            status.installed &&
            !status.available &&
            (status.reason === 'signed-out' ||
              status.reason === 'not-subscription' ||
              status.reason === 'login-unknown');
          const stop = checked ? (
            <Button
              variant="ghost"
              disabled={busy !== undefined}
              onClick={() => choose(null)}
              aria-label={t('engine.stopUsingLabel', { engine: name })}
            >
              {t('engine.stopUsing')}
            </Button>
          ) : null;
          const login = canSignIn ? (
            <Button
              variant="outline"
              disabled={signingIn !== undefined}
              onClick={() => signIn(status.engine)}
              aria-label={t('engine.signInLabel', { engine: name })}
            >
              {t(signingIn === status.engine ? 'engine.signingIn' : 'engine.signIn')}
            </Button>
          ) : null;
          const trailing =
            stop === null && login === null ? undefined : (
              <>
                {login}
                {stop}
              </>
            );
          return (
            <SidebarCardRow
              key={status.engine}
              leading={<ModelBrandIcon brand={ENGINE_BRANDS[status.engine]} size={16} />}
              title={name}
              selection={{ checked }}
              state={status.available ? 'ready' : status.reason}
              meta={
                <span className="bh-card-meta-line">
                  {busy === status.engine
                    ? t('engine.switching')
                    : checked
                      ? t('engine.inUse', { status: statusText(status, t) })
                      : statusText(status, t)}
                </span>
              }
              trailing={trailing}
              disabled={!status.available || busy !== undefined}
              {...(status.available && !checked ? { onClick: () => choose(status.engine) } : {})}
            />
          );
        })}
      </SidebarCardList>
      {signInUrl === undefined ? null : (
        <Note>
          <a href={signInUrl} target="_blank" rel="noopener noreferrer">
            {t('engine.openSignIn')}
          </a>
        </Note>
      )}
      {loadFailed ? (
        <Note tone="danger">
          {t('engine.loadFailed')}{' '}
          <Button variant="ghost" onClick={() => void refresh()}>
            {t('engine.reload')}
          </Button>
        </Note>
      ) : null}
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
    </div>
  );
}
