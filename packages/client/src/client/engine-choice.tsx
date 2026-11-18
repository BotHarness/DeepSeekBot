import { useRef, useState, type ReactElement } from 'react';

import { Button } from './ds/button.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsRows } from './ds/settings-row.js';
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
  model?: string;
  effort?: string;
}

type ModelSelection = Pick<EngineSelectionView, 'model' | 'effort'>;
type EngineOption = { id: string; name: string };
type EngineModel = EngineOption & {
  efforts: EngineOption[];
  defaultEffort?: string;
  isDefault?: true;
};

export interface EnginesView {
  engines: EngineStatusView[];
  selections: EngineSelectionView[];
}

export interface EngineApi {
  read(): Promise<EnginesView>;
  models(engine: EngineId): Promise<EngineModel[]>;
  use(
    bot: string,
    role: EngineRole,
    engine: EngineId | null,
    selection?: ModelSelection,
  ): Promise<void>;
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
      const model = entry?.['model'];
      const effort = entry?.['effort'];
      return entry !== undefined &&
        typeof entry['botSlug'] === 'string' &&
        typeof engine === 'string' &&
        ENGINE_IDS.includes(engine) &&
        typeof role === 'string' &&
        ROLES.includes(role)
        ? [
            {
              botSlug: entry['botSlug'],
              role: role as EngineRole,
              engine: engine as EngineId,
              ...(typeof model === 'string' && model !== '' ? { model } : {}),
              ...(typeof effort === 'string' && effort !== '' ? { effort } : {}),
            },
          ]
        : [];
    }),
  };
}

function parseOption(value: unknown): EngineOption | undefined {
  const entry = record(value);
  const id = entry?.['id'];
  const name = entry?.['name'];
  return typeof id === 'string' && id !== '' && typeof name === 'string' ? { id, name } : undefined;
}

function parseModels(value: unknown): EngineModel[] {
  if (!Array.isArray(value)) throw new Error('Invalid Subscription Engine catalog');
  return value.flatMap((raw): EngineModel[] => {
    const model = parseOption(raw);
    const entry = record(raw);
    const efforts = entry?.['efforts'];
    if (model === undefined || !Array.isArray(efforts)) return [];
    const defaultEffort = entry?.['defaultEffort'];
    return [
      {
        ...model,
        efforts: efforts.flatMap((option) => parseOption(option) ?? []),
        ...(typeof defaultEffort === 'string' ? { defaultEffort } : {}),
        ...(entry?.['isDefault'] === true ? { isDefault: true } : {}),
      },
    ];
  });
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
  async models(engine) {
    return parseModels((await post({ action: 'models', engine }))['models']);
  },
  async use(bot, role, engine, selection) {
    await post({
      action: 'use',
      bot,
      role,
      engine,
      model: selection?.model,
      effort: selection?.effort,
    });
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

function modelOptions(options: readonly EngineOption[], current: string, defaultLabel: string) {
  return [
    { value: '', label: defaultLabel },
    ...options.map(({ id, name }) => ({ value: id, label: name })),
    ...(current !== '' && !options.some(({ id }) => id === current)
      ? [{ value: current, label: current }]
      : []),
  ];
}

function EngineModelChoice({
  selection,
  api,
  t,
  disabled,
  onChange,
}: {
  selection: EngineSelectionView;
  api: EngineApi;
  t: BotHarnessTranslate;
  disabled: boolean;
  onChange: (selection: ModelSelection) => void;
}): ReactElement {
  const [models, setModels] = useState<EngineModel[] | 'failed'>();
  const [attempt, setAttempt] = useState(0);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    setModels(undefined);
    void api.models(selection.engine).then(
      (next) => {
        if (active) setModels(next);
      },
      () => {
        if (active) setModels('failed');
      },
    );
    return () => {
      active = false;
    };
  }, [api, selection.engine, attempt]);

  const model = selection.model ?? '';
  const effort = selection.effort ?? '';
  const picked = Array.isArray(models)
    ? model !== ''
      ? models.find(({ id }) => id === model)
      : effort !== ''
        ? (models.find(({ isDefault }) => isDefault) ?? models[0])
        : undefined
    : undefined;
  const defaultEffort = picked?.efforts.find(({ id }) => id === picked.defaultEffort)?.name;

  return (
    <div ref={mount}>
      {models === 'failed' ? (
        <Note tone="danger">
          {t('engine.modelsFailed')}{' '}
          <Button variant="ghost" onClick={() => setAttempt(attempt + 1)}>
            {t('engine.reload')}
          </Button>
        </Note>
      ) : models === undefined ? (
        <Note>{t('engine.modelsLoading')}</Note>
      ) : models.length === 0 ? (
        <Note>{t('engine.modelsEmpty')}</Note>
      ) : (
        <SettingsRows>
          <SettingsRow
            title={t('engine.model')}
            control={
              <Select
                label={t('engine.model')}
                value={model}
                disabled={disabled}
                options={modelOptions(models, model, t('engine.modelDefault'))}
                onChange={(next) => onChange(next === '' ? {} : { model: next })}
              />
            }
          />
          {picked !== undefined && (picked.efforts.length > 0 || effort !== '') ? (
            <SettingsRow
              title={t('engine.effort')}
              control={
                <Select
                  label={t('engine.effort')}
                  value={effort}
                  disabled={disabled}
                  options={modelOptions(
                    picked.efforts,
                    effort,
                    defaultEffort === undefined
                      ? t('modelPreset.providerDefault')
                      : t('engine.effortDefault', { effort: defaultEffort }),
                  )}
                  onChange={(next) =>
                    onChange({
                      ...(model === '' ? {} : { model }),
                      ...(next === '' ? {} : { effort: next }),
                    })
                  }
                />
              }
            />
          ) : null}
        </SettingsRows>
      )}
    </div>
  );
}

export function EngineChoice({
  slug,
  roles,
  t,
  api = engineApi,
}: {
  slug: string;
  roles: readonly EngineRole[];
  t: BotHarnessTranslate;
  api?: EngineApi;
}): ReactElement {
  const [view, setView] = useState<EnginesView>();
  const [busy, setBusy] = useState<{ role: EngineRole; engine: EngineId | null }>();
  const [signingIn, setSigningIn] = useState<EngineId>();
  const [error, setError] = useState<string>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [signInUrl, setSignInUrl] = useState<string>();
  const alive = useRef(true);
  const generation = useRef(0);
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined);
  const signInDeadline = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      clearTimeout(signInDeadline.current);
    };
  }, [slug]);

  const choose = (
    role: EngineRole,
    engine: EngineId | null,
    ...selection: [ModelSelection?]
  ): void => {
    generation.current += 1;
    setBusy({ role, engine });
    setError(undefined);
    api
      .use(slug, role, engine, ...selection)
      .then(
        () => refresh(),
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
        if (!alive.current) {
          tab?.close();
          return;
        }
        if (url === undefined) tab?.close();
        else if (tab === null || tab.closed) setSignInUrl(url);
        else {
          tab.opener = null;
          tab.location.href = url;
        }
        let done = false;
        const finish = (ready: boolean): void => {
          done = true;
          clearTimeout(poll.current);
          clearTimeout(signInDeadline.current);
          setSigningIn(undefined);
          if (ready) setSignInUrl(undefined);
        };
        signInDeadline.current = setTimeout(() => {
          if (alive.current) finish(false);
        }, SIGN_IN_POLL_DEADLINE_MS);
        const check = (): void => {
          if (done) return;
          void refresh().then((next) => {
            if (!alive.current || done) return;
            if (next?.engines.find((entry) => entry.engine === engine)?.available === true)
              finish(true);
            else poll.current = setTimeout(check, SIGN_IN_POLL_MS);
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

  const renderRole = (role: EngineRole, { engines, selections }: EnginesView): ReactElement => {
    const assignment = role === 'assignment';
    const title = t(assignment ? 'engine.assignmentTitle' : 'engine.orchestratorTitle');
    const selected = selections.find((entry) => entry.botSlug === slug && entry.role === role);
    const selectedStatus = engines.find((entry) => entry.engine === selected?.engine);

    return (
      <div
        className="bh-model-picker"
        role="group"
        aria-label={title}
        data-engine-choice={role}
        key={role}
      >
        <div className="bh-model-picker-heading">
          <strong>{title}</strong>
          <span>{t(assignment ? 'engine.assignmentHint' : 'engine.orchestratorHint')}</span>
        </div>
        <SidebarCardList label={title}>
          {engines.map((status) => {
            const name = engineName(status.engine);
            const checked = selected?.engine === status.engine;
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
                onClick={() => choose(role, null)}
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
                    {busy?.role === role && busy.engine === status.engine
                      ? t('engine.switching')
                      : checked
                        ? t('engine.inUse', { status: statusText(status, t) })
                        : statusText(status, t)}
                  </span>
                }
                trailing={trailing}
                disabled={!status.available || busy !== undefined}
                {...(status.available && !checked
                  ? { onClick: () => choose(role, status.engine) }
                  : {})}
              />
            );
          })}
        </SidebarCardList>
        {assignment && selected !== undefined && selectedStatus?.available === true ? (
          <EngineModelChoice
            key={selected.engine}
            selection={selected}
            api={api}
            t={t}
            disabled={busy !== undefined}
            onChange={(next) => choose(role, selected.engine, next)}
          />
        ) : null}
      </div>
    );
  };

  return (
    <div ref={mount} className="bh-model-picker">
      {view?.engines.length === 0 ? (
        <div className="bh-model-picker" role="group" aria-label={t('engine.title')}>
          <div className="bh-model-picker-heading">
            <strong>{t('engine.title')}</strong>
          </div>
          <Note>{t('engine.localOnly')}</Note>
        </div>
      ) : view === undefined ? null : (
        roles.map((role) => renderRole(role, view))
      )}
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
