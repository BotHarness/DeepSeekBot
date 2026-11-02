export interface AccessTokenVerifier {
  verify(token: string): Promise<string | undefined>;
}

export interface Jwk {
  kty: string;
  kid?: string;
  alg?: string;
  n?: string;
  e?: string;
}

export interface VerifierOptions {
  clientId: string;
  keys: () => Promise<Jwk[]>;
  now?: () => number;
}

const SUBJECT = /^user_[A-Za-z0-9]+$/u;
const KEY_TTL_MS = 10 * 60 * 1000;

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^[A-Za-z0-9_-]*$/u.test(value)) return undefined;
  const padded = value.replaceAll('-', '+').replaceAll('_', '/');
  try {
    return Uint8Array.from(atob(padded + '='.repeat((4 - (padded.length % 4)) % 4)), (char) =>
      char.charCodeAt(0),
    );
  } catch {
    return undefined;
  }
}

function base64UrlJson(value: string): Record<string, unknown> | undefined {
  const bytes = base64UrlBytes(value);
  if (bytes === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function workosKeys(clientId: string, fetcher: typeof fetch = fetch): () => Promise<Jwk[]> {
  return async () => {
    const response = await fetcher(`https://api.workos.com/sso/jwks/${clientId}`);
    if (!response.ok) throw new Error(`jwks ${response.status}`);
    const body = (await response.json()) as { keys?: unknown };
    return Array.isArray(body.keys) ? (body.keys as Jwk[]) : [];
  };
}

export function createAccessTokenVerifier(options: VerifierOptions): AccessTokenVerifier {
  const now = options.now ?? Date.now;
  const issuer = `https://api.workos.com/user_management/${options.clientId}`;
  let cached: { at: number; keys: Map<string, CryptoKey> } | undefined;

  const load = async (): Promise<Map<string, CryptoKey>> => {
    const keys = new Map<string, CryptoKey>();
    for (const jwk of await options.keys()) {
      if (
        jwk.kty !== 'RSA' ||
        typeof jwk.kid !== 'string' ||
        typeof jwk.n !== 'string' ||
        typeof jwk.e !== 'string' ||
        (jwk.alg && jwk.alg !== 'RS256')
      )
        continue;
      keys.set(
        jwk.kid,
        await crypto.subtle.importKey(
          'jwk',
          { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        ),
      );
    }
    cached = { at: now(), keys };
    return keys;
  };

  const key = async (kid: string): Promise<CryptoKey | undefined> => {
    const fresh = cached !== undefined && now() - cached.at < KEY_TTL_MS;
    const found = fresh ? cached?.keys.get(kid) : undefined;
    if (found !== undefined) return found;
    try {
      return (await load()).get(kid);
    } catch {
      return undefined;
    }
  };

  return {
    async verify(token) {
      const parts = token.split('.');
      if (parts.length !== 3) return undefined;
      const [encodedHeader = '', encodedPayload = '', encodedSignature = ''] = parts;
      const header = base64UrlJson(encodedHeader);
      const payload = base64UrlJson(encodedPayload);
      const signature = base64UrlBytes(encodedSignature);
      if (header === undefined || payload === undefined || signature === undefined)
        return undefined;
      if (header['alg'] !== 'RS256' || typeof header['kid'] !== 'string') return undefined;
      const verifyKey = await key(header['kid']);
      if (verifyKey === undefined) return undefined;
      const valid = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        verifyKey,
        signature,
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
      );
      if (!valid) return undefined;
      const seconds = now() / 1000;
      const { sub, iss, exp, nbf } = payload;
      if (iss !== issuer || typeof exp !== 'number' || exp <= seconds) return undefined;
      if (typeof nbf === 'number' && nbf > seconds + 60) return undefined;
      return typeof sub === 'string' && SUBJECT.test(sub) ? sub : undefined;
    },
  };
}
