import type { ClaudeStatus } from './claude-status.js';
import type { CodexStatus } from './codex-status.js';
import {
  ENGINE_DEFINITIONS,
  type EngineAccount,
  type EngineId,
  EngineRefusal,
} from './engine-session.js';

export interface EngineQuotaView {
  usedPercent?: number;
  resetsAt?: string;
  limitedUntil?: string;
  observedAt: string;
}

export interface EngineStatusReport {
  displayName: string;
  engine: EngineId;
  available: boolean;
  reason?: 'host-not-local' | 'not-installed' | 'signed-out' | 'not-subscription' | 'login-unknown';
  installed: boolean;
  version?: string;
  login: CodexStatus['login'] | ClaudeStatus['login'];
  quota?: EngineQuotaView;
}

const SIGN_IN_HINTS: Record<EngineId, string> = {
  codex:
    'Sign the Bot in with your ChatGPT subscription: run `deepseekbot engine login codex` on this computer.',
  claude:
    'Sign the Bot in with your Claude subscription: run `deepseekbot engine login claude` on this computer.',
};

export function requireSubscription(account: EngineAccount): string {
  const hint = SIGN_IN_HINTS[account.engine];
  if (account.kind === 'subscription')
    return account.engine === 'codex'
      ? `ChatGPT ${account.plan}`
      : `Claude ${account.plan.replace(/^claude\s+/iu, '')}`;
  if (account.kind === 'metered')
    throw new EngineRefusal(
      'engine-not-subscription',
      `${account.detail}, which bills per use. ${hint}`,
    );
  throw new EngineRefusal(
    'engine-signed-out',
    `${ENGINE_DEFINITIONS[account.engine].displayName} is not signed in. ${hint}`,
  );
}

export function statusReport(
  engine: EngineId,
  detected: CodexStatus | ClaudeStatus,
  subscription: string,
  quota: EngineQuotaView | undefined,
): EngineStatusReport {
  const reason: EngineStatusReport['reason'] = !detected.installed
    ? 'not-installed'
    : detected.login === subscription
      ? undefined
      : detected.login === 'api-key'
        ? 'not-subscription'
        : detected.login === 'unknown'
          ? 'login-unknown'
          : 'signed-out';
  return {
    engine,
    displayName: ENGINE_DEFINITIONS[engine].displayName,
    available: reason === undefined,
    ...(reason === undefined ? {} : { reason }),
    installed: detected.installed,
    ...(detected.version === undefined ? {} : { version: detected.version }),
    login: detected.login,
    ...(quota === undefined ? {} : { quota }),
  };
}
