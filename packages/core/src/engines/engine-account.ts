import { DEFAULT_CODEX_ACCOUNT } from '@botharness/host-protocol/subscription-engine';
import type { ClaudeStatus } from './claude-status.js';
import type { CodexStatus } from './codex-status.js';
import type { EngineQuotaView, EngineStatusReport } from './engine-host-types.js';
import {
  ENGINE_DEFINITIONS,
  type EngineAccount,
  type EngineId,
  type EngineSession,
  EngineRefusal,
} from './engine-session.js';

const SIGN_IN_HINTS: Record<EngineId, string> = {
  codex:
    'Sign the Bot in with your ChatGPT subscription: run `deepseekbot engine login codex` on this computer.',
  claude:
    'Sign the Bot in with your Claude subscription: run `deepseekbot engine login claude` on this computer.',
};

const ENGINE_LABELS: Record<EngineId, string> = { codex: 'Codex', claude: 'Claude Code' };

export async function readEngineAccount(session: EngineSession): Promise<EngineAccount> {
  const name = ENGINE_LABELS[session.engine];
  return session.account().catch((error: unknown) => {
    if (error instanceof EngineRefusal) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw /ENOENT/u.test(message)
      ? new EngineRefusal('engine-not-installed', `${name} is not installed on this computer`)
      : new EngineRefusal('engine-failed', `${name} did not start: ${message}`);
  });
}

export function requireSubscription(account: EngineAccount, accountId?: string): string {
  const hint =
    account.engine === 'codex' && accountId !== undefined && accountId !== DEFAULT_CODEX_ACCOUNT
      ? `Sign the Bot in with your ChatGPT subscription: run \`deepseekbot engine login ${accountId}\` on this computer.`
      : SIGN_IN_HINTS[account.engine];
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
    `${ENGINE_LABELS[account.engine]} is not signed in. ${hint}`,
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
