import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import {
  enginePickerAccountKey as engineModelKey,
  isEngineId,
  type EngineAccountIdentity,
  type EngineId,
  type EngineModelView,
  type NamedEngineAccount,
} from '@botharness/host-protocol/subscription-engine';
import { useRef, useState } from 'react';

import {
  bridgeHost,
  parseSessionEngineQuota,
  type BridgeCall,
  type SessionEngineQuota,
} from './bridge.js';
import { observeResource } from './messaging-defaults-live.js';
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
  quota?: SessionEngineQuota;
} & EngineAccountIdentity &
  ({ available: true } | { available: false; reason: EngineUnavailableReason });

export interface EngineSelectionView extends SubscriptionModel {
  botSlug: string;
  role: EngineRole;
  fallback?: boolean;
}

export interface EnginesView {
  revision?: number;
  engines: EngineStatusView[];
  selections: EngineSelectionView[];
}

export type { EngineModelView } from '@botharness/host-protocol/subscription-engine';

export interface EngineApi {
  read(): Promise<EnginesView>;
  models(engine: EngineId, accountId?: string): Promise<EngineModelView[]>;
  use(
    bot: string,
    role: EngineRole,
    engine: EngineId | null,
    options?: { model?: string; effort?: string; fallback?: boolean; accountId?: string },
  ): Promise<void>;
  login(engine: EngineId, accountId?: string): Promise<{ url?: string }>;
  cancelLogin?(engine: EngineId, accountId?: string): Promise<void>;
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
  const quota = parseSessionEngineQuota(entry['quota']);
  const base = {
    engine,
    installed: entry['installed'] === true,
    ...(quota === undefined ? {} : { quota }),
    ...(typeof entry['accountId'] === 'string' ? { accountId: entry['accountId'] } : {}),
    ...(typeof entry['accountName'] === 'string' ? { accountName: entry['accountName'] } : {}),
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
    ...(typeof body?.['revision'] === 'number' ? { revision: body['revision'] } : {}),
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
              ...(typeof entry['accountId'] === 'string' ? { accountId: entry['accountId'] } : {}),
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

function parseEngineModels(value: unknown): EngineModelView[] {
  const models = record(value)?.['models'];
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
}

export async function loadGrantableEngineAccounts(
  call: BridgeCall,
  signal: AbortSignal,
): Promise<NamedEngineAccount[]> {
  const value = await bridgeHost(call, signal).call('engineAccounts', { grantable: true });
  const accounts = record(value)?.['accounts'];
  if (!Array.isArray(accounts)) throw new Error('Invalid subscription accounts');
  return accounts.flatMap((raw): NamedEngineAccount[] => {
    const account = record(raw);
    const engine = account?.['engine'];
    const id = account?.['id'];
    const name = account?.['name'];
    return isEngineId(engine) && typeof id === 'string' && typeof name === 'string'
      ? [{ engine, id, name }]
      : [];
  });
}

export function bridgeEngineApi(call: BridgeCall): EngineApi {
  const host = bridgeHost(call);
  const request = (input: Record<string, unknown>) =>
    host.call('engineSelection', { request: input });
  return {
    async read() {
      return parseEngines(await request({ action: 'status' }));
    },
    async models(engine, accountId) {
      return parseEngineModels(await request({ action: 'models', engine: accountId ?? engine }));
    },
    async use(bot, role, engine, options) {
      await request({ action: 'use', bot, role, engine, ...options });
    },
    login: (engine, accountId) => host.call('engineAccountLogin', { id: accountId ?? engine }),
  };
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
  async models(engine, accountId) {
    return parseEngineModels(await post({ action: 'models', engine: accountId ?? engine }));
  },
  async use(bot, role, engine, options) {
    await post({ action: 'use', bot, role, engine, ...options });
  },
  async login(engine, accountId) {
    const result = await post({ action: 'login', engine: accountId ?? engine });
    return typeof result['url'] === 'string' ? { url: result['url'] } : {};
  },
};

const SIGN_IN_POLL_MS = 3000;
const SIGN_IN_POLL_DEADLINE_MS = 3 * 60_000;

export const engineRoles = ['orchestrator', 'assignment'] as const;

export { engineModelKey };

export type EngineModels = Partial<Record<string, readonly EngineModelView[]>>;
type ModelLoads = Partial<Record<string, { state: 'pending' | 'ready' | 'failed' }>>;

export function useSubscriptionEngines(
  enabled: boolean,
  api = engineApi,
  loadModels = true,
  observeAccounts = api === engineApi,
) {
  const [view, setView] = useState<EnginesView>();
  const [models, setModels] = useState<EngineModels>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [modelLoadFailed, setModelLoadFailed] = useState(false);
  const [signingIn, setSigningIn] = useState<string>();
  const [signInUrl, setSignInUrl] = useState<string>();
  const [loginUrl, setLoginUrl] = useState<string>();
  const [cancelling, setCancelling] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  const [error, setError] = useState<string>();
  const alive = useRef(false);
  const generation = useRef(0);
  const loads = useRef<ModelLoads>({});
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined);
  const deadline = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activeLogin = useRef<symbol>(undefined);
  const activeTarget = useRef<{ engine: EngineId; accountId?: string }>(undefined);
  const cancelRequested = useRef<symbol>(undefined);

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
      const keys = new Set(
        next.engines
          .filter((status) => status.available)
          .map(({ engine, accountId }) => engineModelKey(engine, accountId)),
      );
      for (const key of Object.keys(source)) {
        if (keys.has(key)) continue;
        delete source[key];
        setModels((previous) => {
          if (previous[key] === undefined) return previous;
          const { [key]: _removed, ...remaining } = previous;
          return remaining;
        });
      }
      for (const { engine, accountId, available } of next.engines) {
        if (!available) continue;
        const key = engineModelKey(engine, accountId);
        const loaded = source[key];
        if (loaded !== undefined && (loaded.state !== 'failed' || !retry)) continue;
        const request = { state: 'pending' } as const;
        source[key] = request;
        const catalog =
          accountId === undefined ? api.models(engine) : api.models(engine, accountId);
        void catalog.then(
          (values) => {
            if (!alive.current || loads.current !== source || source[key] !== request) return;
            source[key] = { state: 'ready' };
            setModels((previous) => ({ ...previous, [key]: values }));
            setModelLoadFailed(Object.values(source).some((load) => load?.state === 'failed'));
          },
          () => {
            if (!alive.current || loads.current !== source || source[key] !== request) return;
            source[key] = { state: 'failed' };
            setModelLoadFailed(true);
          },
        );
      }
      setModelLoadFailed(Object.values(source).some((load) => load?.state === 'failed'));
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
    const stop = observeAccounts
      ? observeResource('model-providers', async () => {
          if (activeLogin.current === undefined) await refresh();
        })
      : undefined;
    return () => {
      stop?.();
      alive.current = false;
      generation.current += 1;
      loads.current = {};
      activeLogin.current = undefined;
      activeTarget.current = undefined;
      clearTimeout(poll.current);
      clearTimeout(deadline.current);
    };
  }, [enabled, api, loadModels, observeAccounts]);

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

  const signIn = (engine: EngineId, accountId?: string): void => {
    const key = engineModelKey(engine, accountId);
    if (activeLogin.current !== undefined) return;
    const attempt = Symbol();
    activeLogin.current = attempt;
    activeTarget.current = accountId === undefined ? { engine } : { engine, accountId };
    setSigningIn(key);
    setSignInUrl(undefined);
    setLoginUrl(undefined);
    setCancelFailed(false);
    setError(undefined);
    const login = accountId === undefined ? api.login(engine) : api.login(engine, accountId);
    void login.then(
      ({ url }) => {
        if (!alive.current || activeLogin.current !== attempt) return;
        if (url !== undefined) {
          setSignInUrl(url);
          setLoginUrl(url);
        }
        let done = false;
        const finish = (ready: boolean): void => {
          done = true;
          activeLogin.current = undefined;
          activeTarget.current = undefined;
          clearTimeout(poll.current);
          clearTimeout(deadline.current);
          setSigningIn(undefined);
          setLoginUrl(undefined);
          setSignInUrl(undefined);
        };
        deadline.current = setTimeout(() => {
          if (cancelRequested.current !== attempt) finish(false);
        }, SIGN_IN_POLL_DEADLINE_MS);
        const check = async (): Promise<void> => {
          const next = await refresh(false);
          if (!alive.current || done || activeLogin.current !== attempt) return;
          if (
            next?.engines.some(
              (entry) => engineModelKey(entry.engine, entry.accountId) === key && entry.available,
            )
          )
            finish(true);
          else poll.current = setTimeout(() => void check(), SIGN_IN_POLL_MS);
        };
        poll.current = setTimeout(() => void check(), SIGN_IN_POLL_MS);
      },
      (cause: unknown) => {
        if (!alive.current || activeLogin.current !== attempt) return;
        if (cancelRequested.current === attempt) return;
        activeLogin.current = undefined;
        activeTarget.current = undefined;
        setSigningIn(undefined);
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };

  const cancelSignIn = async (): Promise<void> => {
    const attempt = activeLogin.current;
    const target = activeTarget.current;
    if (attempt === undefined || target === undefined || cancelling) return;
    setCancelling(true);
    setCancelFailed(false);
    cancelRequested.current = attempt;
    try {
      await (api.cancelLogin?.(target.engine, target.accountId) ?? Promise.resolve());
    } catch {
      if (cancelRequested.current === attempt) cancelRequested.current = undefined;
      if (alive.current) {
        setCancelling(false);
        setCancelFailed(true);
      }
      return;
    }
    if (cancelRequested.current === attempt) cancelRequested.current = undefined;
    if (!alive.current) return;
    setCancelling(false);
    if (activeLogin.current === attempt) {
      activeLogin.current = undefined;
      activeTarget.current = undefined;
      clearTimeout(poll.current);
      clearTimeout(deadline.current);
      setSigningIn(undefined);
      setSignInUrl(undefined);
      setLoginUrl(undefined);
    }
    await refresh(false);
  };

  return {
    mount,
    view,
    models,
    signIn,
    cancelSignIn,
    cancelling,
    cancelFailed,
    signingIn,
    signInUrl,
    loginUrl,
    loadFailed: loadFailed || modelLoadFailed,
    refresh,
    saveSelection,
    error,
  };
}
