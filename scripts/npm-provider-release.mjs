import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const providerReleasePlan = Object.freeze(
  JSON.parse(readFileSync(new URL('./provider-release-plan.json', import.meta.url), 'utf8')),
);
const registry = 'https://registry.npmjs.org';
const integrity = (bytes) => 'sha512-' + createHash('sha512').update(bytes).digest('base64');

export function verifyProviderArchive(archive, plan) {
  if (integrity(archive.bytes) !== plan.integrity)
    throw new Error('Provider archive differs from the natively qualified bytes');
  if (
    archive.manifest.name !== '@botharness/im-provider' ||
    archive.manifest.name !== plan.name ||
    archive.manifest.version !== plan.version ||
    archive.manifest.private ||
    archive.manifest.license !== 'MIT' ||
    archive.manifest.botharness?.managedByProduct !== true ||
    archive.provenance.source !== plan.providerSource ||
    archive.provenance.compiledOutput?.runtimeFiles !== plan.runtimeFiles ||
    archive.provenance.compiledOutput?.runtimeSha256 !== plan.runtimeSha256 ||
    plan.distTag !== 'next'
  )
    throw new Error('Provider identity or qualification differs from the reviewed plan');
}

function checkRemote(remote, plan) {
  if (
    remote.name !== plan.name ||
    remote.version !== plan.version ||
    remote.dist?.integrity !== plan.integrity
  )
    throw new Error('Registry version already contains different Provider bytes');
}

export async function publishQualifiedProvider({
  archive,
  plan,
  readVersion,
  publish,
  download,
  readTags,
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
}) {
  verifyProviderArchive(archive, plan);
  let remote = await readVersion();
  let publicationError;
  let attempted = false;
  if (remote) checkRemote(remote, plan);
  else {
    attempted = true;
    try {
      await publish();
    } catch (error) {
      publicationError = error;
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      remote = await readVersion();
      if (remote) break;
      if (attempt < 11) await sleep(5_000);
    }
    if (!remote)
      throw new Error('Publication was not observed; inspect registry state before retrying', {
        cause: publicationError,
      });
    checkRemote(remote, plan);
  }
  if (integrity(await download(remote.dist.tarball)) !== plan.integrity)
    throw new Error('Downloaded registry archive differs from the qualified bytes');
  const tags = await readTags();
  if (tags.next !== plan.version)
    throw new Error('Registry next tag does not match the reviewed release');
  return {
    name: plan.name,
    version: plan.version,
    integrity: plan.integrity,
    attempted,
    publicationErrorObserved: publicationError !== undefined,
    archiveVerified: true,
    next: tags.next,
    latest: tags.latest,
  };
}

async function json(path) {
  const response = await fetch(`${registry}/${path}?readback=${Date.now()}`, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'cache-control': 'no-cache' },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Registry readback failed: ${response.status}`);
  return response.json();
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if (!['verify', 'publish'].includes(mode) || !file)
    throw new Error('Use npm-provider-release.mjs verify|publish <qualified-archive>');
  const path = resolve(file);
  const archive = {
    bytes: readFileSync(path),
    manifest: JSON.parse(
      execFileSync('tar', ['-xOf', path, 'package/package.json'], { encoding: 'utf8' }),
    ),
    provenance: JSON.parse(
      execFileSync('tar', ['-xOf', path, 'package/PROVENANCE.json'], { encoding: 'utf8' }),
    ),
  };
  verifyProviderArchive(archive, providerReleasePlan);
  if (mode === 'verify') {
    console.log(JSON.stringify({ verified: true, ...providerReleasePlan }));
    return;
  }
  if (
    process.env.GITHUB_REPOSITORY !== 'BotHarness/DeepSeekBot' ||
    process.env.GITHUB_REF_NAME !== providerReleasePlan.tag ||
    !process.env.NPM_TOKEN
  )
    throw new Error('Publication requires the reviewed GitHub tag and protected NPM_TOKEN');
  const token = process.env.NPM_TOKEN;
  const userconfig = join(dirname(path), '.npm-release-empty');
  writeFileSync(userconfig, '');
  const env = { ...process.env };
  for (const key of Object.keys(env))
    if (/^npm_config_.*(auth|token|password)/i.test(key)) delete env[key];
  delete env.NPM_TOKEN;
  delete env.NODE_AUTH_TOKEN;
  env['npm_config_//registry.npmjs.org/:_authToken'] = token;
  const result = await publishQualifiedProvider({
    archive,
    plan: providerReleasePlan,
    readVersion: () =>
      json(`${encodeURIComponent(providerReleasePlan.name)}/${providerReleasePlan.version}`),
    readTags: async () =>
      (await json(encodeURIComponent(providerReleasePlan.name)))?.['dist-tags'] ?? {},
    download: async (url) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'registry.npmjs.org')
        throw new Error('Unexpected registry archive origin');
      const response = await fetch(parsed, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`Archive download refused: ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
    publish: () =>
      new Promise((done, fail) => {
        const child = spawn(
          'npm',
          [
            'publish',
            path,
            '--access',
            'public',
            '--tag',
            'next',
            '--ignore-scripts',
            '--registry',
            registry,
            '--userconfig',
            userconfig,
            '--globalconfig',
            '/dev/null',
          ],
          { env, stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let output = '';
        child.stdout.on('data', (chunk) => {
          output += chunk;
        });
        child.stderr.on('data', (chunk) => {
          output += chunk;
        });
        child.on('error', fail);
        child.on('close', (status) => {
          console.log(
            output.replaceAll(token, '[redacted]').trim().split('\n').slice(-40).join('\n'),
          );
          if (status === 0) done();
          else fail(new Error(`npm publish failed (${status})`));
        });
      }),
  });
  console.log(JSON.stringify(result));
  writeFileSync(
    join(dirname(path), 'provider-publication-result.json'),
    JSON.stringify(result, null, 2),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
