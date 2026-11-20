#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

export const ENVIRONMENTS = ['staging', 'production'];
const API = 'https://api.workos.com/user_management';
const DIR = join(homedir(), '.config', 'botharness', 'workos');
const keychainService = (environment) => `botharness.workos.${environment}`;
const clientIdPath = (environment) => join(DIR, `${environment}.client_id`);

function requireMac() {
  if (process.platform !== 'darwin') {
    console.error('workos-secret uses the macOS Keychain; run it on the Mac.');
    process.exit(2);
  }
}

function environmentArg(value) {
  if (!ENVIRONMENTS.includes(value)) {
    console.error(`environment must be one of: ${ENVIRONMENTS.join(', ')}`);
    process.exit(2);
  }
  return value;
}

function readClientId(environment) {
  try {
    return readFileSync(clientIdPath(environment), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

function readKey(environment) {
  try {
    const value = execFileSync(
      'security',
      ['find-generic-password', '-s', keychainService(environment), '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return value.length === 0 ? undefined : value;
  } catch {
    return undefined;
  }
}

export function workosCredential(environment) {
  const prefix = `WORKOS_${environment.toUpperCase()}_`;
  const fromEnv = (name) => process.env[prefix + name]?.trim() || undefined;
  const clientId =
    fromEnv('CLIENT_ID') ?? (process.platform === 'darwin' ? readClientId(environment) : undefined);
  const apiKey =
    fromEnv('API_KEY') ?? (process.platform === 'darwin' ? readKey(environment) : undefined);
  return clientId && apiKey ? { clientId, apiKey } : undefined;
}

async function set(environment) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const current = readClientId(environment);
  const answer = (
    await rl.question(
      `WorkOS ${environment} client id (client_…)${current ? ` [${current}]` : ''}: `,
    )
  ).trim();
  rl.close();
  const clientId = answer || current;
  if (!clientId || !/^client_[A-Za-z0-9]+$/u.test(clientId)) {
    console.error('That is not a WorkOS client id.');
    process.exit(2);
  }
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  writeFileSync(clientIdPath(environment), `${clientId}\n`, { mode: 0o600 });
  console.log(`Now paste the ${environment} WorkOS secret key (sk_…). Input stays hidden.`);
  const stored = spawnSync(
    'security',
    [
      'add-generic-password',
      '-U',
      '-a',
      process.env.USER ?? 'botharness',
      '-s',
      keychainService(environment),
      '-w',
    ],
    { stdio: 'inherit' },
  );
  if (stored.status !== 0) process.exit(stored.status ?? 1);
  const key = readKey(environment);
  if (!key?.startsWith('sk_')) {
    console.error('Stored, but the value does not start with sk_. Run set again to replace it.');
    process.exit(1);
  }
  console.log(`Saved ${environment}: ${clientId}, key ${key.length} chars, in the login Keychain.`);
}

function check() {
  for (const environment of ENVIRONMENTS) {
    const credential = workosCredential(environment);
    const clientId = credential?.clientId;
    const key = credential?.apiKey;
    console.log(
      `${environment}: ${clientId ?? 'no client id'}, ${key ? `key ${key.length} chars` : 'no key'}`,
    );
  }
}

const why = (body) =>
  [body.code ?? body.error, body.message ?? body.error_description].filter(Boolean).join(': ');

const claims = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
};

async function post(path, body, { apiKey, form = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json',
    },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function probe(environment) {
  const credential = workosCredential(environment);
  if (!credential) {
    console.error(
      `No ${environment} credential. Run: node scripts/workos-secret.mjs set ${environment}`,
    );
    process.exit(1);
  }
  const { clientId, apiKey } = credential;
  const email = `qa-magic-auth-${Date.now()}@example.org`;
  const rows = [];
  const row = (step, result, detail = '') => rows.push({ step, result, detail });

  const created = await post('/magic_auth', { email }, { apiKey });
  const code = created.body.code;
  row(
    'create code',
    created.status,
    typeof code === 'string' ? 'code returned' : why(created.body),
  );
  if (typeof code !== 'string') return print(rows, email);

  const signedIn = await post(
    '/authenticate',
    {
      client_id: clientId,
      client_secret: apiKey,
      grant_type: 'urn:workos:oauth:grant-type:magic-auth:code',
      email,
      code,
    },
    { apiKey },
  );
  const access = claims(signedIn.body.access_token ?? '');
  row(
    'sign in with code',
    signedIn.status,
    signedIn.status === 200
      ? `user ${signedIn.body.user?.id}, method ${signedIn.body.authentication_method}, iss ${access.iss}`
      : why(signedIn.body),
  );
  const wrong = await post(
    '/authenticate',
    {
      client_id: clientId,
      client_secret: apiKey,
      grant_type: 'urn:workos:oauth:grant-type:magic-auth:code',
      email,
      code: code === '000000' ? '111111' : '000000',
    },
    { apiKey },
  );
  row('wrong code', wrong.status, why(wrong.body));
  if (typeof signedIn.body.refresh_token !== 'string') return print(rows, email);

  const refreshed = await post(
    '/authenticate',
    {
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: signedIn.body.refresh_token,
    },
    { form: true },
  );
  row(
    'refresh without secret',
    refreshed.status,
    refreshed.status === 200
      ? `same user ${refreshed.body.user?.id === signedIn.body.user?.id}, rotated ${
          refreshed.body.refresh_token !== signedIn.body.refresh_token
        }`
      : why(refreshed.body),
  );
  if (access.sid) {
    const revoked = await post('/sessions/revoke', { session_id: access.sid }, { apiKey });
    row('revoke test session', revoked.status);
  }
  print(rows, email, signedIn.body.user?.id);
}

function print(rows, email, userId) {
  console.table(rows);
  console.log(`test email ${email}${userId ? `, test user ${userId} (not deleted)` : ''}`);
}

const invokedDirectly = process.argv[1]?.endsWith('workos-secret.mjs') === true;
if (invokedDirectly) {
  const [mode = 'check', target, flag] = process.argv.slice(2);
  if (mode === 'set') {
    requireMac();
    await set(environmentArg(target));
  } else if (mode === 'check') check();
  else if (mode === 'probe-email-code') {
    const environment = environmentArg(target ?? 'staging');
    if (environment === 'production' && flag !== '--allow-production') {
      console.error('The probe creates a test user. Pass --allow-production to run it there.');
      process.exit(2);
    }
    await probe(environment);
  } else {
    console.error(
      'usage: node scripts/workos-secret.mjs set <staging|production> | check | probe-email-code [staging|production]',
    );
    process.exit(2);
  }
}
