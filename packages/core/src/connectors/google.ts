import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

import type { GoogleRequest } from './google-api.js';
import { ConnectorError } from './errors.js';
import {
  GOOGLE_ACCESS_TOKEN_REFUSAL,
  GOOGLE_SERVICE,
  GOOGLE_STATE_PREFIX,
  googleAuthorizationUrl,
  googleClientSchema,
  googleGrantedAccess,
  googleLoginRequired,
  googleJson,
  googleProfile,
  googleScopes,
  googleToken,
  revokeGoogleToken,
  type GoogleClient,
  type GoogleToken,
} from './google-oauth.js';
import {
  CONNECTOR_ACCOUNT_LABEL,
  type ConnectorAccess,
  type ConnectorAccountRecord,
  type ConnectorStore,
} from './store.js';

const CLIENT_KEY = credentialKey('botharness-connectors', 'google-client');
const LOGIN_TIMEOUT_MS = 10 * 60_000;
const EARLY_REFRESH_MS = 60_000;
const SIGN_IN = z.object({
  subject: z.string(),
  refreshToken: z.string().min(1).max(4096),
  scope: z.string().max(4096),
});
type SignIn = z.infer<typeof SIGN_IN>;

type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;
type Options = {
  store: ConnectorStore;
  credentials: () => Credentials | undefined;
  redirectUri: () => string | undefined;
  changed(): void;
  fetcher?: typeof fetch;
  now?: () => number;
};

interface Login {
  accountId: string;
  redirectUri: string;
  verifier: string;
  access: ConnectorAccess;
  expiresAt: number;
}

function signInKey(accountId: string) {
  return credentialKey('botharness-connectors', `google-${accountId}`);
}

export class GoogleConnectors {
  readonly #store: ConnectorStore;
  readonly #options: Options;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  readonly #pending = new Map<string, Login>();
  readonly #tokens = new Map<string, { token: string; expiresAt: number }>();
  #tail: Promise<unknown> = Promise.resolve();

  constructor(options: Options) {
    this.#options = options;
    this.#store = options.store;
    this.#fetch = options.fetcher ?? fetch;
    this.#now = options.now ?? Date.now;
  }

  #serialize<T>(run: () => Promise<T>): Promise<T> {
    const next = this.#tail.catch(() => undefined).then(run);
    this.#tail = next;
    return next;
  }

  #credentials(): Credentials {
    const credentials = this.#options.credentials();
    if (credentials === undefined)
      throw new ConnectorError('credential-unavailable', 'The credential store is unavailable.');
    return credentials;
  }

  async #client(): Promise<GoogleClient | undefined> {
    const record = await this.#credentials().readRecord(CLIENT_KEY);
    if (record?.kind !== 'grant') return undefined;
    return googleClientSchema.safeParse(record.payload).data;
  }

  async #requireClient(): Promise<GoogleClient> {
    const client = await this.#client();
    if (client === undefined)
      throw new ConnectorError(
        'not-configured',
        'Add your Google OAuth client in App connections first.',
      );
    return client;
  }

  async #signIn(accountId: string): Promise<SignIn | undefined> {
    const record = await this.#credentials().readRecord(signInKey(accountId));
    return record?.kind === 'grant' ? SIGN_IN.safeParse(record.payload).data : undefined;
  }

  #saveSignIn(accountId: string, signIn: SignIn) {
    return this.#credentials().modifyRecord(signInKey(accountId), async () => ({
      kind: 'grant',
      payload: signIn,
    }));
  }

  async setup() {
    const redirectUri = this.#options.redirectUri();
    return {
      configured: (await this.#client()) !== undefined,
      ...(redirectUri === undefined ? {} : { redirectUri }),
      oauthClientType: 'web' as const,
      browserLocation: 'host' as const,
      apis: [
        { id: 'gmail.googleapis.com', name: 'Gmail API' },
        { id: 'calendar-json.googleapis.com', name: 'Google Calendar API' },
        { id: 'people.googleapis.com', name: 'People API' },
      ],
      limits: {
        testingRefreshTokenDays: 7,
        unverifiedExternalUserCap: 100,
        internalWorkspaceOnly: true,
      },
    };
  }

  async setClient(input: { clientId: string; clientSecret: string }) {
    const clientId = input.clientId.trim();
    const clientSecret = input.clientSecret.trim();
    if (/^ya29\./.test(clientId) || /^ya29\./.test(clientSecret))
      throw new ConnectorError('invalid', GOOGLE_ACCESS_TOKEN_REFUSAL);
    const parsed = googleClientSchema.safeParse({ clientId, clientSecret });
    if (!parsed.success)
      throw new ConnectorError(
        'invalid',
        'Enter the client ID and client secret of a Google Web application OAuth client.',
      );
    return this.#serialize(async () => {
      const previous = await this.#client();
      if (
        previous?.clientId !== parsed.data.clientId &&
        this.#store.accounts().some((account) => account.provider === 'google')
      )
        throw new ConnectorError(
          'invalid',
          'Disconnect the existing Google Workspace accounts before changing the OAuth client ID.',
        );
      await this.#credentials().modifyRecord(CLIENT_KEY, async () => ({
        kind: 'grant',
        payload: parsed.data,
      }));
      this.#pending.clear();
      return this.setup();
    });
  }

  login(label: string) {
    return this.#serialize(async () => {
      const name = label.trim();
      if (!CONNECTOR_ACCOUNT_LABEL.test(name))
        throw new ConnectorError('invalid', 'The account label is invalid.');
      const account = this.#store
        .accounts()
        .find((candidate) => candidate.provider === 'google' && candidate.label === name);
      return this.#start(name, account);
    });
  }

  reconnect(accountId: string) {
    return this.#serialize(async () => {
      const account = this.#store.account(accountId);
      if (account?.provider !== 'google')
        throw new ConnectorError('not-found', 'The Google Workspace account does not exist.');
      return this.#start(account.label, account);
    });
  }

  #hasWriteGrant(accountId: string): boolean {
    return this.#store
      .grants()
      .some((grant) => grant.accountId === accountId && grant.access === 'write');
  }

  async #start(label: string, existing: ConnectorAccountRecord | undefined) {
    const redirectUri = this.#options.redirectUri();
    if (redirectUri === undefined)
      throw new ConnectorError(
        'not-configured',
        'Google sign-in needs the Host web listener on localhost or a loopback address.',
      );
    const client = await this.#requireClient();
    const account =
      existing ??
      this.#store.createAccount({
        provider: 'google',
        service: GOOGLE_SERVICE,
        label,
        externalId: `pending-${randomUUID()}`,
      });
    const now = this.#now();
    for (const [state, login] of this.#pending) {
      if (login.expiresAt <= now || login.accountId === account.accountId)
        this.#pending.delete(state);
    }
    const state = GOOGLE_STATE_PREFIX + randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const access = this.#hasWriteGrant(account.accountId) ? 'write' : 'read';
    this.#pending.set(state, {
      accountId: account.accountId,
      redirectUri,
      verifier,
      access,
      expiresAt: now + LOGIN_TIMEOUT_MS,
    });
    this.#options.changed();
    return {
      account,
      url: googleAuthorizationUrl({
        clientId: client.clientId,
        state,
        redirectUri,
        access,
        challenge: createHash('sha256').update(verifier).digest('base64url'),
      }),
    };
  }

  finish(params: URLSearchParams): Promise<ConnectorAccountRecord> {
    return this.#serialize(async () => {
      const state = params.get('state') ?? '';
      const login = this.#pending.get(state);
      this.#pending.delete(state);
      if (login === undefined || login.expiresAt <= this.#now())
        throw new ConnectorError(
          'invalid',
          'This Google sign-in link expired or was already used. Start sign-in again.',
        );
      const code = params.get('code');
      if (params.has('error') || !code || code.length > 4096)
        throw new ConnectorError(
          'invalid',
          'Google sign-in did not complete. Start sign-in again.',
        );
      const account = this.#store.account(login.accountId);
      if (account?.provider !== 'google')
        throw new ConnectorError('not-found', 'The Google Workspace account does not exist.');
      if (login.access === 'write' && !this.#hasWriteGrant(account.accountId))
        throw new ConnectorError(
          'invalid',
          'The Write grant changed. Start sign-in again for the current access.',
        );
      const client = await this.#requireClient();
      const token = await googleToken(this.#fetch, client, {
        grant_type: 'authorization_code',
        code,
        code_verifier: login.verifier,
        redirect_uri: login.redirectUri,
      });
      const scope = token.scope ?? googleScopes(login.access).join(' ');
      const access = googleGrantedAccess(scope);
      if (access === undefined || token.refresh_token === undefined)
        throw new ConnectorError(
          'invalid',
          'Google did not grant offline access to Gmail, Calendar and Contacts. Sign in again and grant all the read permissions.',
        );
      const identity = await googleProfile(this.#fetch, token.access_token);
      if (/^\d+$/.test(account.externalId) && account.externalId !== identity.sub)
        throw new ConnectorError(
          'invalid',
          'Choose the Google account that was originally connected under this label.',
        );
      if (
        this.#store
          .accounts()
          .some(
            (other) =>
              other.provider === 'google' &&
              other.externalId === identity.sub &&
              other.accountId !== account.accountId,
          )
      )
        throw new ConnectorError(
          'invalid',
          'This Google account is already connected. Use its existing label.',
        );
      if (login.access === 'write' && !this.#hasWriteGrant(account.accountId))
        throw new ConnectorError(
          'invalid',
          'The Write grant changed. Start sign-in again for the current access.',
        );
      const effective = login.access === 'read' ? 'read' : access;
      const previous = await this.#signIn(account.accountId);
      await this.#saveSignIn(account.accountId, {
        subject: identity.sub,
        refreshToken: token.refresh_token,
        scope,
      });
      let saved: ConnectorAccountRecord | undefined;
      try {
        saved = this.#store.updateAccount(account.accountId, {
          status: 'active',
          identity: identity.email,
          externalId: identity.sub,
          access: effective,
        });
        if (saved === undefined)
          throw new ConnectorError('not-found', 'The Google Workspace account does not exist.');
      } catch (error) {
        if (previous === undefined)
          await this.#credentials().deleteRecord(signInKey(account.accountId));
        else await this.#saveSignIn(account.accountId, previous);
        throw error;
      }
      this.#cache(account.accountId, token);
      this.#options.changed();
      return saved;
    });
  }

  #cache(accountId: string, token: GoogleToken) {
    this.#tokens.set(accountId, {
      token: token.access_token,
      expiresAt: this.#now() + token.expires_in * 1000,
    });
  }

  async call(input: {
    accountId: string;
    requests: readonly [GoogleRequest, ...GoogleRequest[]];
    signal: AbortSignal;
    authorize(): void;
  }): Promise<unknown> {
    input.authorize();
    const token = await this.#accessToken(input.accountId);
    let result: unknown;
    for (const request of input.requests) {
      input.signal.throwIfAborted();
      input.authorize();
      result = await googleJson(
        this.#fetch,
        request.url,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(request.payload === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(request.payload === undefined
            ? {}
            : { method: 'POST', body: JSON.stringify(request.payload) }),
          signal: input.signal,
        },
        request.response,
      );
    }
    return result;
  }

  #accessToken(accountId: string): Promise<string> {
    return this.#serialize(async () => {
      const account = this.#store.account(accountId);
      if (account?.provider !== 'google' || account.status !== 'active')
        throw new ConnectorError('not-configured', googleLoginRequired);
      const cached = this.#tokens.get(accountId);
      if (cached !== undefined && cached.expiresAt > this.#now() + EARLY_REFRESH_MS)
        return cached.token;
      try {
        const signIn = await this.#signIn(accountId);
        if (signIn === undefined || signIn.subject !== account.externalId)
          throw new ConnectorError('not-configured', googleLoginRequired);
        const token = await googleToken(this.#fetch, await this.#requireClient(), {
          grant_type: 'refresh_token',
          refresh_token: signIn.refreshToken,
        });
        const scope = token.scope ?? signIn.scope;
        const access = googleGrantedAccess(scope);
        if (access === undefined || (account.access === 'write' && access === 'read'))
          throw new ConnectorError('not-configured', googleLoginRequired);
        if (token.refresh_token !== undefined || scope !== signIn.scope)
          await this.#saveSignIn(accountId, {
            ...signIn,
            scope,
            refreshToken: token.refresh_token ?? signIn.refreshToken,
          });
        this.#cache(accountId, token);
        return token.access_token;
      } catch {
        this.#tokens.delete(accountId);
        this.#store.updateAccount(accountId, { status: 'expired' });
        this.#options.changed();
        throw new ConnectorError('not-configured', googleLoginRequired);
      }
    });
  }

  remove(accountId: string): Promise<boolean> {
    return this.#serialize(async () => {
      if (this.#store.account(accountId)?.provider !== 'google') return false;
      for (const [state, login] of this.#pending) {
        if (login.accountId === accountId) this.#pending.delete(state);
      }
      const signIn = await this.#signIn(accountId);
      await this.#credentials().deleteRecord(signInKey(accountId));
      this.#tokens.delete(accountId);
      const removed = this.#store.removeAccount(accountId);
      this.#options.changed();
      if (signIn !== undefined)
        await revokeGoogleToken(this.#fetch, signIn.refreshToken).catch(() => undefined);
      return removed;
    });
  }
}
