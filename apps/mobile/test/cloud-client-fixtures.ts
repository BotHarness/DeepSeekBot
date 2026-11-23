import { createHash } from 'node:crypto';
import { CloudClient, type CloudRuntime } from '../src/cloud/client';
import { MOBILE_REDIRECT_URI, publicInstance } from '../src/cloud/instance-contract';

export const config = publicInstance({
  instanceId: 'tob-test-uat',
  environment: 'uat',
  server: 'https://tob.example.test',
  clientId: 'client_test',
  issuer: 'https://api.workos.com/user_management/client_test',
  authkitDomain: 'example-staging.authkit.app',
  mobileRedirectUri: MOBILE_REDIRECT_URI,
});

export const token = 'header.' + btoa(JSON.stringify({ exp: 4000000000 })) + '.signature';

export function fixture() {
  let storage: string | null = null;
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const state = {
    drift: false,
    offline: false,
    failWrite: false,
    refreshError: 0,
    wrongState: false,
    cancelled: false,
    tokenNumber: 0,
    browserUrl: '',
    user: 'user_test',
    instanceRole: 'admin',
    onboardingError: false,
  };
  const response = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
  const rt: CloudRuntime = {
    read: async () => storage,
    write: async (value) => {
      if (state.failWrite) throw Error('private platform error');
      storage = value;
    },
    now: () => 1000000,
    random: () => 'random-verifier-or-state-43-characters-00000000',
    challenge: async () => 's256-challenge',
    digest: async (value) => createHash('sha256').update(value).digest('hex'),
    authorize: async (url) => {
      state.browserUrl = url;
      return state.cancelled
        ? null
        : MOBILE_REDIRECT_URI +
            '?code=authorization-code&state=' +
            (state.wrongState ? 'wrong' : new URL(url).searchParams.get('state'));
    },
    request: async (url, init) => {
      calls.push({ url, init });
      if (state.offline) throw Error('network');
      if (url.endsWith('/.well-known/open-cloud-groups'))
        return response({
          ...config,
          auth: { ...config.auth, mobileRedirectUris: state.drift ? [] : [MOBILE_REDIRECT_URI] },
        });
      if (url === config.auth.tokenEndpoint) {
        if (
          new URLSearchParams(String(init?.body)).get('grant_type') === 'refresh_token' &&
          state.refreshError
        )
          return response(
            { error: state.refreshError === 400 ? 'invalid_grant' : 'temporarily_unavailable' },
            state.refreshError,
          );
        return response({
          access_token: token,
          refresh_token: 'secret-refresh-' + ++state.tokenNumber,
        });
      }
      if (url.endsWith('/api/onboarding'))
        return state.onboardingError
          ? response({ error: { code: 'IDENTITY_UNAVAILABLE' } }, 503)
          : response({ organizationId: 'org_default' });
      if (url.endsWith('/api/me'))
        return response({
          userId: state.user,
          instanceId: config.instanceId,
          instanceRole: state.instanceRole,
        });
      if (url.endsWith('/api/auth/logout')) return response({ remoteRevoked: true });
      throw Error('unexpected request');
    },
  };
  const client = new CloudClient(rt);
  return { client, rt, calls, state, stored: () => storage };
}

export async function loggedIn() {
  const f = fixture();
  await f.client.importConfig(JSON.stringify(config));
  await f.client.login(config.instanceId);
  return f;
}

export function organizationsFixture() {
  const f = fixture();
  const original = f.rt.request;
  const state = {
    selected: '',
    role: 'owner',
    version: 1,
    description: '',
    loseCreate: false,
    denied: false,
    mismatch: false,
  };
  const operations: string[] = [];
  f.rt.request = async (url, init) => {
    if (url === config.auth.tokenEndpoint) {
      const id = new URLSearchParams(String(init?.body)).get('organization_id');
      if (id) state.selected = id;
    }
    if (!url.includes('/api/organizations')) return original(url, init);
    if (state.denied)
      return Response.json({ error: { code: 'ORGANIZATION_ACCESS_DENIED' } }, { status: 403 });
    const org = {
      organizationId: state.mismatch ? 'org_wrong' : 'org_a',
      name: 'Mobile project',
      description: state.description,
      version: state.version,
      role: state.role,
    };
    if (url.endsWith('/access'))
      return Response.json({ organizationId: 'org_a', role: state.role });
    if (init?.method === 'POST') {
      operations.push(new Headers(init.headers).get('Idempotency-Key')!);
      if (state.loseCreate) {
        state.loseCreate = false;
        throw new Error('response lost');
      }
      return Response.json({ created: true, organizationId: 'org_a' });
    }
    if (url.endsWith('/org_a')) {
      if (state.selected !== 'org_a')
        return Response.json({ error: { code: 'ORGANIZATION_TOKEN_REQUIRED' } }, { status: 403 });
      if (init?.method === 'PATCH') {
        if (state.role !== 'owner')
          return Response.json({ error: { code: 'ORGANIZATION_OWNER_REQUIRED' } }, { status: 403 });
        const body = JSON.parse(String(init.body));
        if (body.version !== state.version)
          return Response.json(
            { error: { code: 'ORGANIZATION_VERSION_CONFLICT' } },
            { status: 409 },
          );
        state.description = body.description;
        state.version++;
        org.description = state.description;
        org.version = state.version;
      }
      return Response.json(org);
    }
    return Response.json({ organizations: [org], nextCursor: null });
  };
  return { ...f, state, operations };
}
