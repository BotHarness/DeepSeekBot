import {
  CODEX_DEVICE_VERIFICATION_URL,
  isCodexDeviceCode,
  type EngineDeviceLoginChallenge,
  type EngineDeviceLoginEnd,
} from '@botharness/host-protocol/engine-device-login';

import { startEngineLogin, type EngineCommand } from './engine-command.js';

const MAX_DEVICE_CODE_AGE_MS = 15 * 60_000;

export async function runCodexDeviceLogin(
  target: EngineCommand,
  signal: AbortSignal,
  onChallenge: (challenge: EngineDeviceLoginChallenge) => void,
): Promise<EngineDeviceLoginEnd> {
  let displayed = false;
  let seenUrl = false;
  let code: string | undefined;
  let lifetime = MAX_DEVICE_CODE_AGE_MS;
  let expired = false;

  const end = await startEngineLogin(
    { ...target, name: 'codex', label: 'Codex', signal },
    ['login', '--device-auth'],
    {
      onLine(text, url) {
        const line = text.trim();
        if (
          /^\s*(?:error(?:\s+logging in with device code)?[: ]+)?device (?:code|auth|authorization).*\b(?:expired|timed out)\b/iu.test(
            line,
          )
        )
          expired = true;
        if (displayed) return;
        const link = url?.split(/[<>()\[\]"']/u, 1)[0]?.replace(/[.,;:]$/u, '');
        if (link === CODEX_DEVICE_VERIFICATION_URL) seenUrl = true;
        const expires = /\bexpires in\s+(\d+)\s+(minutes?|seconds?)\b/iu.exec(line);
        if (expires?.[1] !== undefined && expires[2] !== undefined) {
          const duration =
            Number(expires[1]) * (expires[2].toLowerCase().startsWith('min') ? 60_000 : 1_000);
          if (duration > 0) lifetime = Math.min(duration, MAX_DEVICE_CODE_AGE_MS);
        }
        const candidate =
          /^(?:\d+\.\s+)?(?:enter\s+(?:(?:this|the|your)\s+)?)?(?:(?:one-time|user|device|verification)\s+)?code\s*[:=]\s*([A-Z0-9-]+)\b/iu.exec(
            line,
          )?.[1] ?? line;
        if (isCodexDeviceCode(candidate)) code ??= candidate;
        if (!seenUrl || code === undefined) return;
        displayed = true;
        onChallenge({
          url: CODEX_DEVICE_VERIFICATION_URL,
          code,
          expiresAt: new Date(Date.now() + lifetime).toISOString(),
        });
        code = undefined;
        return lifetime;
      },
    },
  );
  if (end === 'cancelled' || (end === 'completed' && displayed)) return { status: end };
  if (end === 'timed-out') return { status: displayed ? 'expired' : 'failed' };
  return { status: expired ? 'expired' : 'failed' };
}
