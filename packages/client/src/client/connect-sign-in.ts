const CONNECT_PATH = './api/botharness/devices/connect';

export interface ConnectSignInCode {
  userCode: string;
  verificationUri: string;
}

export async function startConnectSignIn(): Promise<ConnectSignInCode> {
  const response = await fetch(CONNECT_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'sign-in' }),
    credentials: 'same-origin',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (
    !response.ok ||
    typeof body['userCode'] !== 'string' ||
    typeof body['verificationUri'] !== 'string'
  )
    throw new Error(typeof body['code'] === 'string' ? body['code'] : 'sign-in-unavailable');
  return { userCode: body['userCode'], verificationUri: body['verificationUri'] };
}
