import { MethodRefused } from '@botharness/host-client/client';
import type { HostClient } from './host-settings';

export type CloudConnectionView = {
  connection: {
    id: string;
    fingerprint: string;
    name: string;
    organizationId: string;
    channelId: string;
    actorId: string;
    ownerUserId: string;
    version: number;
    config?: unknown;
  };
  active: boolean;
  revision: number;
  cursor: number;
  policy: { allowedUsers: string[]; forwardTargets: string[]; environment: string };
};

export type CloudConnectionsResult = {
  connections: CloudConnectionView[];
  credentialRemoved?: boolean;
};

export type CloudResult =
  | { kind: 'ok'; result: CloudConnectionsResult }
  | { kind: 'rejected'; message: string }
  | { kind: 'refused' }
  | { kind: 'error' };

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const hasControl = (text: string) =>
  [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

const MOBILE_REDIRECT_URI = 'ai.botharness.deepseekbot.dev:/oauth2redirect';

function validConfig(value: unknown): boolean {
  const config = record(value);
  if (!config) return false;
  const keys = [
    'formatVersion',
    'protocolVersion',
    'instanceId',
    'name',
    'environment',
    'server',
    'auth',
  ];
  if (Object.keys(config).length !== keys.length || keys.some((key) => !Object.hasOwn(config, key)))
    return false;
  if (config['formatVersion'] !== 1 || config['protocolVersion'] !== 1) return false;
  if (
    typeof config['instanceId'] !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(config['instanceId']) ||
    typeof config['name'] !== 'string' ||
    !config['name'].trim() ||
    config['name'].length > 100 ||
    hasControl(config['name']) ||
    (config['environment'] !== 'uat' && config['environment'] !== 'local')
  )
    return false;
  if (typeof config['server'] !== 'string') return false;
  try {
    const url = new URL(config['server']);
    if (
      url.protocol !== 'https:' ||
      url.origin !== config['server'] ||
      url.username ||
      url.password
    )
      return false;
  } catch {
    return false;
  }
  const auth = record(config['auth']);
  if (!auth) return false;
  const authKeys = [
    'provider',
    'clientId',
    'issuer',
    'authkitDomain',
    'deviceAuthorizationEndpoint',
    'tokenEndpoint',
    'jwksUri',
    'mobileRedirectUris',
  ];
  if (
    Object.keys(auth).length !== authKeys.length ||
    authKeys.some((key) => !Object.hasOwn(auth, key)) ||
    auth['provider'] !== 'workos' ||
    typeof auth['clientId'] !== 'string' ||
    !/^client_[A-Za-z0-9]+$/.test(auth['clientId']) ||
    auth['issuer'] !== `https://api.workos.com/user_management/${auth['clientId']}` ||
    auth['deviceAuthorizationEndpoint'] !==
      'https://api.workos.com/user_management/authorize/device' ||
    auth['tokenEndpoint'] !== 'https://api.workos.com/user_management/authenticate' ||
    auth['jwksUri'] !== `https://api.workos.com/sso/jwks/${auth['clientId']}` ||
    typeof auth['authkitDomain'] !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*\.authkit\.app$/.test(auth['authkitDomain']) ||
    !Array.isArray(auth['mobileRedirectUris']) ||
    (auth['mobileRedirectUris'] as unknown[]).length > 1 ||
    (auth['mobileRedirectUris'] as unknown[]).some((uri) => uri !== MOBILE_REDIRECT_URI)
  )
    return false;
  return true;
}

function validConnection(value: unknown): value is CloudConnectionView {
  const entry = record(value);
  const connection = record(entry?.['connection']);
  const policy = record(entry?.['policy']);
  if (!entry || !connection || !policy) return false;
  return (
    typeof connection['id'] === 'string' &&
    /^cloud-[a-f0-9]{64}$/.test(connection['id']) &&
    typeof connection['fingerprint'] === 'string' &&
    typeof connection['name'] === 'string' &&
    typeof connection['organizationId'] === 'string' &&
    typeof connection['channelId'] === 'string' &&
    typeof connection['actorId'] === 'string' &&
    typeof connection['ownerUserId'] === 'string' &&
    connection['version'] === 1 &&
    typeof entry['active'] === 'boolean' &&
    Number.isSafeInteger(entry['revision']) &&
    Number.isSafeInteger(entry['cursor']) &&
    Array.isArray(policy['allowedUsers']) &&
    Array.isArray(policy['forwardTargets']) &&
    typeof policy['environment'] === 'string'
  );
}

function callResult(value: unknown): CloudConnectionsResult {
  const raw = record(value);
  if (!raw || !Array.isArray(raw['connections'])) return { connections: [] };
  return {
    connections: raw['connections'].filter(validConnection),
    ...(typeof raw['credentialRemoved'] === 'boolean'
      ? { credentialRemoved: raw['credentialRemoved'] }
      : {}),
  };
}

function failure(error: unknown): CloudResult {
  if (error instanceof MethodRefused) {
    if (error.code === 'secret-route-refused') return { kind: 'refused' };
    return { kind: 'rejected', message: error.message };
  }
  return { kind: 'error' };
}

export async function listCloudConnections(client: HostClient): Promise<CloudResult> {
  try {
    const value = await client.call<unknown>('cloudConnections', { operation: 'list' });
    return { kind: 'ok', result: callResult(value) };
  } catch (error) {
    return failure(error);
  }
}

export async function importCloudCredential(
  client: HostClient,
  credential: Record<string, unknown>,
): Promise<CloudResult> {
  try {
    const value = await client.call<unknown>('cloudConnections', {
      operation: 'import',
      credential,
    });
    return { kind: 'ok', result: callResult(value) };
  } catch (error) {
    return failure(error);
  }
}

export type CredentialText =
  | { kind: 'valid'; credential: Record<string, unknown> }
  | { kind: 'invalid'; reason: 'json' | 'shape' | 'large' };

const MAX_CREDENTIAL_TEXT = 20_000;

export function parseCredentialText(text: string): CredentialText {
  if (text.length > MAX_CREDENTIAL_TEXT) return { kind: 'invalid', reason: 'large' };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { kind: 'invalid', reason: 'json' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return { kind: 'invalid', reason: 'shape' };
  const v = value as Record<string, unknown>;
  const allowed = [
    'version',
    'config',
    'organizationId',
    'channelId',
    'actorId',
    'ownerUserId',
    'name',
    'operationId',
    'secret',
  ];
  const valid =
    v.version === 1 &&
    typeof v.organizationId === 'string' &&
    /^org_[A-Za-z0-9]+$/.test(v.organizationId) &&
    typeof v.channelId === 'string' &&
    /^ch_[a-f0-9]{64}$/.test(v.channelId) &&
    typeof v.actorId === 'string' &&
    /^ag_[a-f0-9]{64}$/.test(v.actorId) &&
    typeof v.ownerUserId === 'string' &&
    /^user_[A-Za-z0-9]+$/.test(v.ownerUserId) &&
    typeof v.name === 'string' &&
    v.name.trim().length > 0 &&
    v.name.length <= 80 &&
    !hasControl(v.name) &&
    typeof v.operationId === 'string' &&
    /^[A-Za-z0-9_-]{16,100}$/.test(v.operationId) &&
    typeof v.secret === 'string' &&
    /^[a-f0-9]{64}$/.test(v.secret) &&
    validConfig(v.config) &&
    Object.keys(v).every((key) => allowed.includes(key));
  return valid ? { kind: 'valid', credential: v } : { kind: 'invalid', reason: 'shape' };
}
