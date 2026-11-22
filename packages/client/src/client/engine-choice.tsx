import {
  parseEngineDeviceLoginProgress,
  type EngineDeviceLoginProgress,
} from '@botharness/host-protocol/engine-device-login';
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
  email?: string;
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
  login(
    engine: EngineId,
    accountId?: string,
    mode?: 'device-auth',
  ): Promise<{
    url?: string;
    attemptId?: string;
  }>;
  deviceLoginStatus?(id: string, attemptId: string): Promise<EngineDeviceLoginProgress>;
  cancelLogin?(
    engine: EngineId,
    accountId?: string,
    attemptId?: string,
  ): Promise<{ cancelled: boolean } | void>;
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

interface AccountDetail {
  email?: string;
  quota?: SessionEngineQuota;
}

function accountDetails(value: unknown): Map<string, AccountDetail> {
  const details = new Map<string, AccountDetail>();
  if (!Array.isArray(value)) return details;
  for (const raw of value) {
    const account = record(raw);
    if (typeof account?.['id'] !== 'string') continue;
    const quota = parseSessionEngineQuota(account['quota']);
    details.set(account['id'], {
      ...(typeof account['email'] === 'string' ? { email: account['email'] } : {}),
      ...(quota === undefined ? {} : { quota }),
    });
  }
  return details;
}

function parseStatus(
  value: unknown,
  details: ReadonlyMap<string, AccountDetail>,
): EngineStatusView | undefined {
  const entry = record(value);
  const engine = entry?.['engine'];
  if (entry === undefined || !isEngineId(engine)) return undefined;
  const detail =
    typeof entry['accountId'] === 'string' ? details.get(entry['accountId']) : undefined;
  const snapshot = detail?.quota;
  const quota =
    snapshot !== undefined &&
    (Object.keys(snapshot.windows ?? {}).length > 0 || snapshot.usedPercent !== undefined)
      ? snapshot
      : (parseSessionEngineQuota(entry['quota']) ?? snapshot);
  const email = detail?.email;
  const base = {
    engine,
    installed: entry['installed'] === true,
    ...(quota === undefined ? {} : { quota }),
    ...(email === undefined ? {} : { email }),
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
  const details = accountDetails(body?.['accounts']);
  return {
    ...(typeof body?.['revision'] === 'number' ? { revision: body['revision'] } : {}),
    engines: engines.flatMap((entry) => parseStatus(entry, details) ?? []),
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
        ...(typeof row['resolvedModel'] === 'string'
          ? { resolvedModel: row['resolvedModel'] }
          : {}),
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

export function engineLoginActions(
  call: BridgeCall,
): Pick<EngineApi, 'login' | 'deviceLoginStatus' | 'cancelLogin'> {
  const host = bridgeHost(call);
  return {
    login: (engine, accountId, mode) =>
      host.call('engineAccountLogin', {
        id: accountId ?? engine,
        ...(mode === undefined ? {} : { mode }),
      }),
    async deviceLoginStatus(id, attemptId) {
      const progress = parseEngineDeviceLoginProgress(
        await host.call('engineAccountLoginStatus', { id, attemptId }),
      );
      if (progress === undefined) throw new Error('Invalid device sign-in progress');
      return progress;
    },
    cancelLogin: (engine, accountId, attemptId) =>
      host.call('engineAccountLoginCancel', {
        id: accountId ?? engine,
        ...(attemptId === undefined ? {} : { attemptId }),
      }),
  };
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
    ...engineLoginActions(call),
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

interface DeviceSignInView {
  key: string;
  progress: EngineDeviceLoginProgress;
  canCancel: boolean;
}

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
  const [deviceSignIn, setDeviceSignIn] = useState<DeviceSignInView>();
  const [cancelling, setCancelling] = useState(false);
  const [cancelFailed, setCancelFailed] = useState(false);
  const [error, setError] = useState<string>();
  const alive = useRef(false);
  const generation = useRef(0);
  const loads = useRef<ModelLoads>({});
  const poll = useRef<ReturnType<typeof setTimeout>>(undefined);
  const deadline = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stopDeviceRead = useRef<() => void>(undefined);
  const activeLogin = useRef<symbol>(undefined);
  const activeTarget = useRef<{
    engine: EngineId;
    accountId: string | undefined;
    mode: 'device-auth' | undefined;
    attemptId?: string;
  }>(undefined);
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
      stopDeviceRead.current?.();
      stopDeviceRead.current = undefined;
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

  const resetSignIn = () => {
    activeLogin.current = undefined;
    activeTarget.current = undefined;
    clearTimeout(poll.current);
    clearTimeout(deadline.current);
    stopDeviceRead.current?.();
    stopDeviceRead.current = undefined;
    setSigningIn(undefined);
    setLoginUrl(undefined);
    setSignInUrl(undefined);
  };

  const signIn = (engine: EngineId, accountId?: string, mode?: 'device-auth'): void => {
    const readDeviceLogin = api.deviceLoginStatus;
    if (
      activeLogin.current !== undefined ||
      (mode === 'device-auth' && readDeviceLogin === undefined)
    )
      return;
    const key = engineModelKey(engine, accountId);
    const attempt = Symbol();
    const target = { engine, accountId, mode };
    const isCurrent = () => alive.current && activeLogin.current === attempt;
    activeLogin.current = attempt;
    activeTarget.current = target;
    setSigningIn(key);
    setSignInUrl(undefined);
    setLoginUrl(undefined);
    setDeviceSignIn(
      mode === 'device-auth'
        ? { key, progress: { status: 'starting' }, canCancel: false }
        : undefined,
    );
    setCancelFailed(false);
    setError(undefined);
    const fail = (cause: unknown) => {
      if (!isCurrent() || cancelRequested.current === attempt) return;
      resetSignIn();
      if (mode === 'device-auth')
        setDeviceSignIn({ key, progress: { status: 'failed' }, canCancel: false });
      else setError(cause instanceof Error ? cause.message : String(cause));
    };

    const login =
      mode === 'device-auth'
        ? api.login(engine, accountId, mode)
        : accountId === undefined
          ? api.login(engine)
          : api.login(engine, accountId);
    void login
      .then(async ({ url, attemptId }) => {
        if (!isCurrent()) return;
        if (mode === 'device-auth' && readDeviceLogin !== undefined) {
          if (attemptId === undefined) throw new Error('Missing device sign-in attempt');
          activeTarget.current = { ...target, attemptId };
          setDeviceSignIn({ key, progress: { status: 'starting' }, canCancel: true });
          const check = async () => {
            const progress = await readDeviceLogin(accountId ?? engine, attemptId);
            if (!isCurrent()) return;
            const pending = progress.status === 'starting' || progress.status === 'pending';
            setDeviceSignIn((current) =>
              current?.progress.status === 'pending' &&
              progress.status === 'pending' &&
              current.progress.code === progress.code &&
              current.progress.expiresAt === progress.expiresAt
                ? current
                : { key, progress, canCancel: pending },
            );
            if (!pending) {
              resetSignIn();
              if (progress.status === 'completed') await refresh(false);
            }
          };
          stopDeviceRead.current = observeResource(
            'engine-device-login',
            check,
            10_000,
            60_000,
            true,
          );
          return;
        }
        if (url !== undefined) {
          setSignInUrl(url);
          setLoginUrl(url);
        }
        deadline.current = setTimeout(() => {
          if (cancelRequested.current !== attempt) resetSignIn();
        }, SIGN_IN_POLL_DEADLINE_MS);
        const check = async (): Promise<void> => {
          const next = await refresh(false);
          if (!isCurrent()) return;
          if (
            next?.engines.some(
              (entry) => engineModelKey(entry.engine, entry.accountId) === key && entry.available,
            )
          )
            resetSignIn();
          else poll.current = setTimeout(() => void check(), SIGN_IN_POLL_MS);
        };
        poll.current = setTimeout(() => void check(), SIGN_IN_POLL_MS);
      })
      .catch(fail);
  };

  const cancelSignIn = async (): Promise<void> => {
    const attempt = activeLogin.current;
    const target = activeTarget.current;
    if (
      attempt === undefined ||
      target === undefined ||
      cancelRequested.current === attempt ||
      (target.mode === 'device-auth' && target.attemptId === undefined)
    )
      return;
    setCancelling(true);
    setCancelFailed(false);
    cancelRequested.current = attempt;
    let result: { cancelled: boolean } | void;
    try {
      result =
        target.attemptId === undefined
          ? await api.cancelLogin?.(target.engine, target.accountId)
          : await api.cancelLogin?.(target.engine, target.accountId, target.attemptId);
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
    if (activeLogin.current !== attempt) return;
    if (target.mode === 'device-auth') {
      if (result?.cancelled !== true) return;
      setDeviceSignIn({
        key: engineModelKey(target.engine, target.accountId),
        progress: { status: 'cancelled' },
        canCancel: false,
      });
    }
    resetSignIn();
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
    deviceSignIn,
    supportsDeviceSignIn: api.deviceLoginStatus !== undefined,
    loadFailed: loadFailed || modelLoadFailed,
    refresh,
    saveSelection,
    error,
  };
}
