import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const DEV_ENV_PATH = join(homedir(), '.config', 'botharness', 'dev.env');
const KEYCHAIN_SERVICE = 'botharness-deepseek';

function fromEnvironment(environment = process.env) {
  const value = environment['DEEPSEEK_API_KEY']?.trim();
  return value === undefined || value.length === 0
    ? undefined
    : { source: '$DEEPSEEK_API_KEY', value };
}

function fromDevEnvFile(path = DEV_ENV_PATH) {
  if (!existsSync(path)) return undefined;
  if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0) {
    throw new Error('Shared DeepSeek dev secret file must not be readable by group or others');
  }
  const text = readFileSync(path, 'utf8');
  const match = /^[ \t]*export[ \t]+DEEPSEEK_API_KEY[ \t]*=[ \t]*(.+?)[ \t]*$/m.exec(text);
  const value = match?.[1]?.replace(/^["']|["']$/gu, '').trim();
  return value === undefined || value.length === 0 ? undefined : { source: path, value };
}

function fromKeychain() {
  if (process.platform !== 'darwin') return undefined;
  try {
    const value = execFileSync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], shell: false, windowsHide: true },
    ).trim();
    return value.length === 0 ? undefined : { source: `Keychain:${KEYCHAIN_SERVICE}`, value };
  } catch {
    return undefined;
  }
}

export function profileDeepSeekCredential(profileHome) {
  const path = join(resolve(profileHome), '.credentials.yaml');
  if (!existsSync(path)) return undefined;
  if (process.platform !== 'win32' && (statSync(path).mode & 0o077) !== 0) {
    throw new Error('DSH profile credential file must not be readable by group or others');
  }
  const refs = readFileSync(path, 'utf8').split(/^refs:[ \t]*$/mu)[1];
  const raw = /^[ \t]{2}DEEPSEEK_API_KEY:[ \t]*(.*)$/mu.exec(refs ?? '')?.[1]?.trim();
  if (!raw) return undefined;
  if (raw === 'null' || raw === '~') return undefined;
  let value = raw;
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      value = JSON.parse(raw);
    } catch {
      return undefined;
    }
  } else if (raw.startsWith("'") && raw.endsWith("'")) {
    value = raw.slice(1, -1).replace(/''/gu, "'");
  }
  return typeof value === 'string' && /^[A-Za-z0-9._-]+$/u.test(value)
    ? { source: path, value }
    : undefined;
}

function saveSharedCredential(credential, destination) {
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32' && (statSync(dirname(destination)).mode & 0o077) !== 0) {
    throw new Error('Shared DeepSeek dev secret directory must not be accessible by others');
  }
  writeFileSync(destination, `export DEEPSEEK_API_KEY=${credential.value}\n`, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  return { source: credential.source, destination };
}

export function adoptProfileCredential(profileHome, destination = DEV_ENV_PATH) {
  const credential = profileDeepSeekCredential(profileHome);
  if (credential === undefined) {
    throw new Error('No compatible DEEPSEEK_API_KEY in the selected DSH profile');
  }
  return saveSharedCredential(credential, destination);
}

export function adoptSharedEnv(sourcePath, destination = DEV_ENV_PATH) {
  const resolved = resolve(sourcePath);
  if (!existsSync(resolved))
    throw new Error(`Shared DeepSeek dev secret file not found: ${resolved}`);
  const credential = fromDevEnvFile(resolved);
  if (credential === undefined || !/^[A-Za-z0-9._-]+$/u.test(credential.value)) {
    throw new Error('No compatible DEEPSEEK_API_KEY in the selected shared file');
  }
  return saveSharedCredential(credential, destination);
}

export function resolveDevSecret({ environment = process.env, devEnvPath = DEV_ENV_PATH } = {}) {
  return fromEnvironment(environment) ?? fromDevEnvFile(devEnvPath) ?? fromKeychain();
}

export function devSecretEnvironment(options) {
  const resolved = resolveDevSecret(options);
  return resolved === undefined
    ? {}
    : { DEEPSEEK_API_KEY: resolved.value, DSH_DEV_SECRET_SOURCE: resolved.source };
}

export function devSecretInstructions() {
  return [
    'No shared launch-environment DeepSeek key found. A DSH profile credential may still work.',
    'For new isolated profiles, adopt a protected existing DSH profile once:',
    '  node scripts/dev-secret.mjs adopt-profile --home <existing-DSH_HOME>',
    'Or store a shared key machine-locally (never in the repo):',
    `  security add-generic-password -U -a "$USER" -s ${KEYCHAIN_SERVICE} -w   # prompts without echo`,
    `  # or write ${DEV_ENV_PATH} yourself, e.g.`,
    `  #   export DEEPSEEK_API_KEY=sk-…`,
    'or export DEEPSEEK_API_KEY for a single run.',
  ].join('\n');
}

const invokedDirectly = process.argv[1]?.endsWith('dev-secret.mjs') === true;
if (invokedDirectly) {
  const mode = process.argv[2] ?? 'check';
  if (mode === 'adopt-profile') {
    if (process.argv[3] !== '--home' || !process.argv[4] || process.argv.length !== 5) {
      console.error('usage: node scripts/dev-secret.mjs adopt-profile --home <existing-DSH_HOME>');
      process.exit(2);
    }
    const adopted = adoptProfileCredential(process.argv[4]);
    console.log(`Shared DeepSeek dev key saved at ${adopted.destination} (0600); no key printed.`);
    process.exit(0);
  }
  if (mode === 'adopt-env') {
    if (process.argv[3] !== '--from' || !process.argv[4] || process.argv.length !== 5) {
      console.error('usage: node scripts/dev-secret.mjs adopt-env --from <existing-dev.env>');
      process.exit(2);
    }
    const adopted = adoptSharedEnv(process.argv[4]);
    console.log(`Shared DeepSeek dev key saved at ${adopted.destination}; no key printed.`);
    process.exit(0);
  }
  const resolved = resolveDevSecret();
  if (resolved === undefined) {
    console.error(devSecretInstructions());
    process.exit(1);
  }
  switch (mode) {
    case 'check':
      console.log(`DeepSeek API key: found in ${resolved.source} (${resolved.value.length} chars)`);
      break;
    case '--export':
      console.log(`export DEEPSEEK_API_KEY=${resolved.value}`);
      break;
    case '--print':
      console.log(resolved.value);
      break;
    default:
      console.error(`unknown mode: ${mode}`);
      process.exit(2);
  }
}
