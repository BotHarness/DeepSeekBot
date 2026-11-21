import {
  CODEX_DEVICE_VERIFICATION_URL,
  isCodexDeviceCode,
  type EngineDeviceLoginChallenge,
  type EngineDeviceLoginEnd,
} from '@botharness/host-protocol/engine-device-login';
import type { Readable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';

import { spawnEngineLogin, stopLoginProcessTree, type EngineCommand } from './engine-command.js';

const MAX_DEVICE_CODE_AGE_MS = 15 * 60_000;
const CHALLENGE_TIMEOUT_MS = 10_000;
const MAX_LINE_LENGTH = 4096;

export function runCodexDeviceLogin(
  target: EngineCommand,
  signal: AbortSignal,
  onChallenge: (challenge: EngineDeviceLoginChallenge) => void,
): Promise<EngineDeviceLoginEnd> {
  return new Promise((resolve) => {
    const child = spawnEngineLogin(target, ['login', '--device-auth'], false);
    let timer: ReturnType<typeof setTimeout>;
    let termination: void | Promise<void>;
    let stopped: EngineDeviceLoginEnd['status'] | undefined;
    let displayed = false;
    let seenUrl = false;
    let code: string | undefined;
    let lifetime = MAX_DEVICE_CODE_AGE_MS;
    let expired = false;

    const stop = (status: 'failed' | 'expired' | 'cancelled') => {
      if (stopped !== undefined) return;
      stopped = status;
      clearTimeout(timer);
      termination = stopLoginProcessTree(child);
    };
    const abort = () => stop('cancelled');
    timer = setTimeout(() => stop('failed'), CHALLENGE_TIMEOUT_MS);

    const readLine = (raw: string) => {
      if (stopped !== undefined) return;
      const line = stripVTControlCharacters(raw).trim();
      if (
        /^\s*(?:error(?:\s+logging in with device code)?[: ]+)?device (?:code|auth|authorization).*\b(?:expired|timed out)\b/iu.test(
          line,
        )
      )
        expired = true;
      if (displayed) return;
      const url = /https:\/\/[^\s<>()\[\]"']+/u.exec(line)?.[0];
      if (url?.replace(/[.,;:]$/u, '') === CODEX_DEVICE_VERIFICATION_URL) seenUrl = true;
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
      clearTimeout(timer);
      timer = setTimeout(() => stop('expired'), lifetime);
      onChallenge({
        url: CODEX_DEVICE_VERIFICATION_URL,
        code,
        expiresAt: new Date(Date.now() + lifetime).toISOString(),
      });
      code = undefined;
    };

    const read = (stream: Readable | null) => {
      let partial = '';
      stream?.setEncoding('utf8').on('data', (chunk: string) => {
        const lines = (partial + chunk).split(/\r?\n/u);
        partial = (lines.pop() ?? '').slice(-MAX_LINE_LENGTH);
        for (const line of lines) readLine(line.slice(-MAX_LINE_LENGTH));
      });
      stream?.on('end', () => readLine(partial));
    };
    read(child.stdout);
    read(child.stderr);
    child.on('error', () => stop('failed'));
    child.on('close', (exitCode) => {
      signal.removeEventListener('abort', abort);
      clearTimeout(timer);
      const status =
        stopped ?? (exitCode === 0 && displayed ? 'completed' : expired ? 'expired' : 'failed');
      void Promise.resolve(termination).then(() => resolve({ status }));
    });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
