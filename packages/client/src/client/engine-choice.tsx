import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import {
  isEngineId,
  type EngineId,
  type EngineModelView,
} from '@botharness/host-protocol/subscription-engine';
import { useRef, useState } from 'react';

import { useMountedResource } from './mounted-resource.js';

export type { EngineId } from '@botharness/host-protocol/subscription-engine';
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

export interface EngineSelectionView extends SubscriptionModel {
  botSlug: string;
  role: EngineRole;
  fallback?: boolean;
}

export interface EnginesView {
  engines: EngineStatusView[];
  selections: EngineSelectionView[];
}

export type { EngineModelView } from '@botharness/host-protocol/subscription-engine';

export interface EngineApi {
  read(): Promise<EnginesView>;
  models(engine: EngineId): Promise<EngineModelView[]>;
  use(
    bot: string,
    role: EngineRole,
    engine: EngineId | null,
    options?: { model?: string; effort?: string; fallback?: boolean },
  ): Promise<void>;
  login(engine: EngineId): Promise<{ url?: string }>;
}

const ENGINES = './api/botharness/engines';
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
  if (entry === undefined || !isEngineId(engine)) return undefined;
  const base = {
    engine,
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
        isEngineId(engine) &&
        (role === 'orchestrator' || role === 'assignment')
        ? [
            {
              botSlug: entry['botSlug'],
              role,
              engine,
              ...(typeof entry['model'] === 'string' ? { model: entry['model'] } : {}),
              ...(typeof entry['effort'] === 'string' ? { effort: entry['effort'] } : {}),
              ...(typeof entry['fallback'] === 'boolean' ? { fallback: entry['fallback'] } : {}),
            },
          ]
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
  async models(engine) {
    const { models } = await post({ action: 'models', engine });
    if (!Array.isArray(models)) throw new Error('Invalid Subscription Engine models');
    return models.flatMap((value): EngineModelView[] => {
      const row = record(value);
      if (typeof row?.['id'] !== 'string' || typeof row['name'] !== 'string') return [];
      return [
        {
          id: row['id'],
          name: row['name'],
          efforts: Array.isArray(row['efforts'])
            ? row['efforts'].flatMap((value) => {
                const effort = record(value);
                return typeof effort?.['id'] === 'string' && typeof effort['name'] === 'string'
                  ? [{ id: effort['id'], name: effort['name'] }]
                  : [];
              })
            : [],
          ...(typeof row['defaultEffort'] === 'string'
            ? { defaultEffort: row['defaultEffort'] }
            : {}),
          ...(row['isDefault'] === true ? { isDefault: true } : {}),
        },
      ];
    });
  },
  async use(bot, role, engine, options) {
    await post({ action: 'use', bot, role, engine, ...options });
  },
  async login(engine) {
    const result = await post({ action: 'login', engine });
    return typeof result['url'] === 'string' ? { url: result['url'] } : {};
  },
};

const SIGN_IN_POLL_MS = 3000;
const SIGN_IN_POLL_DEADLINE_MS = 3 * 60_000;

export const engineRoles = ['orchestrator', 'assignment'] as const;

type EngineModels = Partial<Record<EngineId, readonly EngineModelView[]>>;
type ModelLoads = Partial<Record<EngineId, { state: 'pending' | 'ready' | 'failed' }>>;

export function useSubscriptionEngines(enabled: boolean, api = engineApi, loadModels = true) {
  const [view, setView] = useState<EnginesView>();
  const [models, setModels] = useState<EngineModels>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [modelLoadFailed, setModelLoadFailed] = useState(false);
  const [signingIn, setSigningIn] = useState<EngineId>();
  const [signInUrl, setSignInUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const alive = useRef(false);
  const generation = useRef(0);
  const loads = useRef<ModelLoads>({});
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined);
  const deadline = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeLogin = useRef<symbol>(undefined);

  const refresh = async (retry = true): Promise<EnginesView | undefined> => {
    if (!enabled) return undefined;
    const current = ++generation.current;
    try {
      const next = await api.read();
      if (!alive.current || generation.current !== current) return undefined;
      setView(next);
      setLoadFailed(false);
      if (!loadModels) return next;
      const source = loads.current;
      for (const status of next.engines) {
        const { engine, available } = status;
        if (!available) {
          delete source[engine];
          setModels((previous) => {
            if (previous[engine] === undefined) return previous;
            const { [engine]: _removed, ...remaining } = previous;
            return remaining;
          });
          continue;
        }
        const loaded = source[engine];
        if (loaded !== undefined && (loaded.state !== 'failed' || !retry)) continue;
        const request = { state: 'pending' } as const;
        source[engine] = request;
        void api.models(engine).then(
          (values) => {
            if (!alive.current || loads.current !== source || source[engine] !== request) return;
            source[engine] = { state: 'ready' };
            setModels((previous) => ({ ...previous, [engine]: values }));
            setModelLoadFailed(Object.values(source).some((load) => load.state === 'failed'));
          },
          () => {
            if (!alive.current || loads.current !== source || source[engine] !== request) return;
            source[engine] = { state: 'failed' };
            setModelLoadFailed(true);
          },
        );
      }
      setModelLoadFailed(Object.values(source).some((load) => load.state === 'failed'));
      return next;
    } catch {
      if (alive.current && generation.current === current) setLoadFailed(true);
      return undefined;
    }
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    if (!enabled) return;
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      generation.current += 1;
      loads.current = {};
      activeLogin.current = undefined;
      clearTimeout(poll.current);
      clearTimeout(deadline.current);
    };
  }, [enabled, api, loadModels]);

  const saveSelection = async (
    botSlug: string,
    role: EngineRole,
    choice: SubscriptionModel | null,
    fallback?: boolean,
  ): Promise<void> => {
    generation.current += 1;
    const { engine, ...options } = choice ?? { engine: null };
    await api.use(botSlug, role, engine, {
      ...options,
      ...(role === 'orchestrator' && engine !== null && fallback !== undefined ? { fallback } : {}),
    });
    generation.current += 1;
    if (!alive.current) return;
    setView((previous) =>
      previous === undefined
        ? previous
        : {
            ...previous,
            selections: [
              ...previous.selections.filter(
                (item) => item.botSlug !== botSlug || item.role !== role,
              ),
              ...(choice === null
                ? []
                : [
                    {
                      botSlug,
                      role,
                      ...choice,
                      ...(fallback === undefined ? {} : { fallback }),
                    },
                  ]),
            ],
          },
    );
  };

  const signIn = (engine: EngineId): void => {
    if (activeLogin.current !== undefined) return;
    const tab = window.open('', '_blank');
    if (tab !== null) tab.opener = null;
    const attempt = Symbol();
    activeLogin.current = attempt;
    setSigningIn(engine);
    setSignInUrl(undefined);
    setError(undefined);
    void api.login(engine).then(
      ({ url }) => {
        if (!alive.current || activeLogin.current !== attempt || url === undefined) tab?.close();
        else if (tab === null || tab.closed) setSignInUrl(url);
        else tab.location.href = url;
        if (!alive.current || activeLogin.current !== attempt) return;
        let done = false;
        const finish = (ready: boolean): void => {
          done = true;
          activeLogin.current = undefined;
          clearTimeout(poll.current);
          clearTimeout(deadline.current);
          setSigningIn(undefined);
          if (ready) setSignInUrl(undefined);
        };
        deadline.current = setTimeout(() => finish(false), SIGN_IN_POLL_DEADLINE_MS);
        const check = async (): Promise<void> => {
          const next = await refresh(false);
          if (!alive.current || done || activeLogin.current !== attempt) return;
          if (next?.engines.some((entry) => entry.engine === engine && entry.available))
            finish(true);
          else poll.current = setTimeout(() => void check(), SIGN_IN_POLL_MS);
        };
        poll.current = setTimeout(() => void check(), SIGN_IN_POLL_MS);
      },
      (cause: unknown) => {
        tab?.close();
        if (!alive.current || activeLogin.current !== attempt) return;
        activeLogin.current = undefined;
        setSigningIn(undefined);
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  return {
    mount,
    view,
    models,
    signIn,
    signingIn,
    signInUrl,
    loadFailed: loadFailed || modelLoadFailed,
    refresh,
    saveSelection,
    error,
  };
}
