import { ACTIVITY_STALE_SECONDS } from '../../core/src/live-activity/contract.js';
import type { ActivitySender } from './live-activity.js';

export interface ActivityApnsOptions {
  teamId?: string;
  keyId?: string;
  privateKey?: string;
  bundleIdentifier?: string;
  environment?: string;
  fetch?: typeof fetch;
}
const base64 = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
const encoded = (value: unknown) => base64(new TextEncoder().encode(JSON.stringify(value)));

export function createActivityApns(options: ActivityApnsOptions): ActivitySender {
  let key: Promise<CryptoKey | undefined> | undefined;
  let cached: { token: string; expires: number } | undefined;
  const signingKey = (): Promise<CryptoKey | undefined> => {
    if (key) return key;
    key = (async () => {
      if (
        !/^[A-Z0-9]{10}$/u.test(options.teamId ?? '') ||
        !/^[A-Z0-9]{10}$/u.test(options.keyId ?? '') ||
        !['app.deepseekbot.mobile', 'ai.botharness.deepseekbot.dev'].includes(
          options.bundleIdentifier ?? '',
        ) ||
        !['production', 'sandbox'].includes(options.environment ?? '') ||
        !options.privateKey
      )
        return undefined;
      try {
        const bytes = Uint8Array.from(
          atob(options.privateKey.replace(/-----[^-]+-----/gu, '').replace(/\s/gu, '')),
          (c) => c.charCodeAt(0),
        );
        return await crypto.subtle.importKey(
          'pkcs8',
          bytes,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['sign'],
        );
      } catch {
        return undefined;
      }
    })();
    return key;
  };
  const jwt = async (privateKey: CryptoKey): Promise<string> => {
    const now = Date.now();
    if (cached && cached.expires > now) return cached.token;
    const input = `${encoded({ alg: 'ES256', kid: options.keyId })}.${encoded({ iss: options.teamId, iat: Math.floor(now / 1000) })}`;
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      privateKey,
      new TextEncoder().encode(input),
    );
    const token = `${input}.${base64(new Uint8Array(signature))}`;
    cached = { token, expires: now + 50 * 60_000 };
    return token;
  };
  return {
    async capability() {
      return (await signingKey()) ? { bundleIdentifier: options.bundleIdentifier! } : undefined;
    },
    async send(input) {
      const privateKey = await signingKey();
      if (!privateKey) return 'unavailable';
      const authorization = `bearer ${await jwt(privateKey)}`;
      const { state, source, updatedAt, locale, timestamp, terminal } = input;
      const deliveryTime = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        aps: {
          timestamp,
          event: terminal ? 'end' : 'update',
          'content-state': {
            name: 'TobsRequest',
            props: JSON.stringify({ state, source, updatedAt, locale }),
          },
          'stale-date': timestamp + ACTIVITY_STALE_SECONDS,
          ...(terminal ? { 'dismissal-date': deliveryTime + 120 } : {}),
        },
      });
      const origin =
        options.environment === 'sandbox'
          ? 'https://api.sandbox.push.apple.com'
          : 'https://api.push.apple.com';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await (options.fetch ?? fetch)(`${origin}/3/device/${input.token}`, {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
            headers: {
              authorization,
              'content-type': 'application/json',
              'apns-push-type': 'liveactivity',
              'apns-topic': `${options.bundleIdentifier}.push-type.liveactivity`,
              'apns-priority': terminal ? '10' : '5',
              'apns-expiration': String(deliveryTime + ACTIVITY_STALE_SECONDS),
            },
            body,
          });
          if (response.ok) return 'sent';
          const error = (await response.json().catch(() => ({}))) as { reason?: string };
          if (
            response.status === 410 ||
            ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(
              error.reason ?? '',
            )
          )
            return 'invalid-token';
          if (response.status !== 429 && response.status < 500) return 'unavailable';
        } catch {}
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
      return 'unavailable';
    },
  };
}
