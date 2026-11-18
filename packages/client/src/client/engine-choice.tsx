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

export interface EngineStatusView {
  engine: EngineId;
  available: boolean;
  reason?: 'host-not-local' | 'not-installed' | 'signed-out' | 'not-subscription' | 'login-unknown';
  installed: boolean;
  version?: string;
}

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
    return (await response.json()) as EnginesView;
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
const SIGN_IN_POLL_LIMIT = 60;

function statusText(status: EngineStatusView, t: BotHarnessTranslate): string {
  const reason = status.reason;
  if (reason === undefined)
    return status.version === undefined
      ? t('engine.signedIn')
      : t('engine.signedInVersion', { version: status.version });
  switch (reason) {
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
  const alive = useRef(true);
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = (): Promise<EnginesView | undefined> =>
    api.read().then(
      (next) => {
        if (alive.current) {
          setView(next);
          setLoadFailed(false);
        }
        return next;
      },
      () => {
        if (alive.current) setLoadFailed(true);
        return undefined;
      },
    );

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
    setBusy(engine ?? 'clear');
    setError(undefined);
    api
      .use(slug, role, engine)
      .then(
        () => refresh().then(() => onChange?.(engine ?? undefined)),
        (cause: unknown) => {
          if (alive.current) setError(cause instanceof Error ? cause.message : String(cause));
        },
      )
      .finally(() => {
        if (alive.current) setBusy(undefined);
      });
  };

  const signIn = (engine: EngineId): void => {
    setSigningIn(engine);
    setError(undefined);
    api.login(engine).then(
      ({ url }) => {
        if (url !== undefined) window.open(url, '_blank', 'noopener');
        let tries = 0;
        const check = (): void => {
          void refresh().then((next) => {
            const ready = next?.engines.find((entry) => entry.engine === engine)?.available;
            if (!alive.current) return;
            if (ready === true || ++tries >= SIGN_IN_POLL_LIMIT) setSigningIn(undefined);
            else poll.current = setTimeout(check, SIGN_IN_POLL_MS);
          });
        };
        poll.current = setTimeout(check, SIGN_IN_POLL_MS);
      },
      (cause: unknown) => {
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
            (status.reason === 'signed-out' ||
              status.reason === 'not-subscription' ||
              status.reason === 'login-unknown');
          const trailing = checked ? (
            <Button
              variant="ghost"
              disabled={busy !== undefined}
              onClick={() => choose(null)}
              aria-label={t('engine.stopUsingLabel', { engine: name })}
            >
              {t('engine.stopUsing')}
            </Button>
          ) : canSignIn ? (
            <Button
              variant="outline"
              disabled={signingIn !== undefined}
              onClick={() => signIn(status.engine)}
              aria-label={t('engine.signInLabel', { engine: name })}
            >
              {t(signingIn === status.engine ? 'engine.signingIn' : 'engine.signIn')}
            </Button>
          ) : undefined;
          return (
            <SidebarCardRow
              key={status.engine}
              leading={<ModelBrandIcon brand={ENGINE_BRANDS[status.engine]} size={16} />}
              title={name}
              selection={{ checked }}
              state={status.available ? 'ready' : (status.reason ?? 'unavailable')}
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
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
    </div>
  );
}
