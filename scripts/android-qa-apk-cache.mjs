import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const sha256 = /^[a-f0-9]{64}$/;
const commitId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function debugSigningHash(mobileDir, expoPackage) {
  try {
    return await hashFile(join(mobileDir, 'android', 'app', 'debug.keystore'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const key = spawnSync(
    'tar',
    ['-xOf', join(dirname(expoPackage), 'template.tgz'), 'package/android/app/debug.keystore'],
    { shell: false, windowsHide: true },
  );
  if (key.status !== 0 || key.stdout.length === 0)
    throw new Error('Cannot read the Expo template debug keystore. Check that tar is available.', {
      cause: key.error,
    });
  return createHash('sha256').update(key.stdout).digest('hex');
}

export async function androidQaApkIdentity({ repoRoot, abi, metroPort }) {
  const mobileDir = join(repoRoot, 'apps', 'mobile');
  const expoPackage = createRequire(join(mobileDir, 'package.json')).resolve('expo/package.json');
  const requireExpo = createRequire(expoPackage);
  process.env.NODE_ENV ||= 'development';
  requireExpo('@expo/env').load(mobileDir, { silent: true });
  if (process.env.DEEPSEEKBOT_APP_VARIANT === 'store')
    throw new Error('Android QA requires the development app variant.');
  const { createFingerprintAsync } = requireExpo('@expo/fingerprint');
  const { hash: nativeFingerprint } = await createFingerprintAsync(mobileDir, {
    platforms: ['android'],
    preset: 'strict',
    ignorePaths: ['android', 'ios'],
    silent: true,
  });
  const identity = {
    schema: 1,
    nativeFingerprint,
    abi,
    variant: 'debug',
    signingKeySha256: await debugSigningHash(mobileDir, expoPackage),
    lockfileSha256: await hashFile(join(repoRoot, 'pnpm-lock.yaml')),
    metroPort,
  };
  return {
    ...identity,
    key: createHash('sha256').update(JSON.stringify(identity)).digest('hex'),
  };
}

async function findCachedApk(cacheDir, key) {
  try {
    const metadata = JSON.parse(await readFile(join(cacheDir, 'build.json'), 'utf8'));
    if (
      metadata?.key !== key ||
      typeof metadata.sha256 !== 'string' ||
      !sha256.test(metadata.sha256) ||
      typeof metadata.builtCommit !== 'string' ||
      !commitId.test(metadata.builtCommit) ||
      typeof metadata.builtAt !== 'string' ||
      typeof metadata.builtDirty !== 'boolean'
    )
      return undefined;
    const { sha256: digest, builtCommit, builtDirty, builtAt } = metadata;
    const apk = join(cacheDir, `${digest}.apk`);
    if ((await hashFile(apk)) === digest)
      return { apk, sha256: digest, builtCommit, builtDirty, builtAt };
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  return undefined;
}

export async function resolveAndroidQaApk({ queueRoot, identity, build }) {
  const cacheDir = join(queueRoot, 'apk-cache', identity.key);
  const cached = await findCachedApk(cacheDir, identity.key);
  if (cached) return { ...cached, reused: true };
  if (build === undefined)
    throw new Error('No compatible Android QA APK. Run build for the current batch first.');

  const { apk: source, commit: builtCommit, dirty: builtDirty } = await build();
  const digest = await hashFile(source);
  const apk = join(cacheDir, `${digest}.apk`);
  const metadata = {
    key: identity.key,
    sha256: digest,
    builtCommit,
    builtDirty,
    builtAt: new Date().toISOString(),
  };
  await mkdir(cacheDir, { recursive: true });
  const temporary = await mkdtemp(join(cacheDir, '.publish-'));
  try {
    const temporaryApk = join(temporary, 'app.apk');
    await copyFile(source, temporaryApk);
    if ((await hashFile(temporaryApk)) !== digest)
      throw new Error('Debug APK changed during cache publication. Run build again.');
    await rename(temporaryApk, apk);
    const temporaryMetadata = join(temporary, 'build.json');
    await writeFile(temporaryMetadata, JSON.stringify(metadata) + '\n');
    await rename(temporaryMetadata, join(cacheDir, 'build.json'));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { apk, sha256: digest, builtCommit, builtDirty, builtAt: metadata.builtAt, reused: false };
}
