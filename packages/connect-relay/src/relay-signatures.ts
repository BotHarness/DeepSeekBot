function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export async function hmac(key: string, message: string): Promise<string> {
  const imported = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64Url(await crypto.subtle.sign('HMAC', imported, new TextEncoder().encode(message)));
}

export async function verifyBotProof(
  key: string,
  proof: unknown,
  statement: string,
): Promise<boolean> {
  if (typeof proof !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(proof)) return false;
  const imported = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const signature = Uint8Array.from(
    atob(proof.replaceAll('-', '+').replaceAll('_', '/') + '='),
    (c) => c.charCodeAt(0),
  );
  return crypto.subtle.verify('HMAC', imported, signature, new TextEncoder().encode(statement));
}
