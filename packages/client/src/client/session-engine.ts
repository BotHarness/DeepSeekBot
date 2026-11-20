import type {
  EngineId,
  RoutingGroupEngineUnavailable,
} from '@botharness/host-protocol/subscription-engine';
import type { SessionEngine, SessionEngineQuota } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

export function shortTime(at: string): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function engineName(engine: string): string {
  if (engine === 'codex') return 'Codex';
  if (engine === 'claude') return 'Claude Code';
  return engine;
}

export function routingGroupEngineReason(
  engine: EngineId,
  reason: RoutingGroupEngineUnavailable,
  t: BotHarnessTranslate,
): string {
  switch (reason) {
    case 'host-not-local':
      return t('engine.localOnly');
    case 'not-installed':
      return t('engine.notInstalled', { engine: engineName(engine) });
    case 'signed-out':
      return t('engine.signInLabel', { engine: engineName(engine) });
    case 'not-subscription':
      return t('engine.notSubscription');
    case 'models-unavailable':
      return t('routingGroups.engineModelsUnavailable');
    case 'login-unknown':
      return t('engine.loginUnknown');
  }
}

export function engineQuotaText(
  quota: SessionEngineQuota | undefined,
  t: BotHarnessTranslate,
): string | undefined {
  if (quota === undefined) return undefined;
  if (quota.limitedUntil !== undefined)
    return t('sessions.detail.engineLimited', { until: shortTime(quota.limitedUntil) });
  if (quota.usedPercent === undefined || quota.resetsAt === undefined) return undefined;
  return t('sessions.detail.engineQuota', {
    percent: String(Math.round(quota.usedPercent)),
    until: shortTime(quota.resetsAt),
  });
}

export function sessionEngineText(engine: SessionEngine, t: BotHarnessTranslate): string {
  if (engine.state === 'starting')
    return t('sessions.detail.engineStarting', { engine: engineName(engine.engine) });
  if (engine.state === 'waiting-approval')
    return t('sessions.detail.engineWaitingApproval', { engine: engineName(engine.engine) });
  const base =
    engine.account === undefined
      ? engineName(engine.engine)
      : t('sessions.detail.engine', {
          engine: engineName(engine.engine),
          account: engine.account,
        });
  const quota = engineQuotaText(engine.quota, t);
  return quota === undefined ? base : `${base} · ${quota}`;
}

export function engineChipLabel(
  model: string,
  quota: SessionEngineQuota | undefined,
  t: BotHarnessTranslate,
): string {
  if (quota?.limitedUntil !== undefined) return `${model} · ${t('sessions.engineLimitedShort')}`;
  if (quota?.usedPercent === undefined) return model;
  return `${model} · ${Math.round(quota.usedPercent)}%`;
}
