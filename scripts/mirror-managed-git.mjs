#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pins = JSON.parse(
  readFileSync(join(root, 'packages/core/src/memory/managed-git.json'), 'utf8'),
);
const bucket = 'botharness-media';
const prefix = `git/dugite-native/${pins.release}`;
const mirror = `https://media.botharness.ai/${prefix}`;
const github = `https://github.com/desktop/dugite-native/releases/download/${pins.release}`;
const verifyOnly = process.argv.includes('--verify');

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function mirrorUrl(name) {
  return verifyOnly ? `${mirror}/${name}` : `${mirror}/${name}?check=${Date.now()}`;
}

const work = mkdtempSync(join(tmpdir(), 'botharness-managed-git-'));
let failed = 0;
try {
  const entries = Object.entries(pins.assets);
  for (const [index, [platform, asset]] of entries.entries()) {
    const mirrored = await download(mirrorUrl(asset.name)).catch(() => undefined);
    if (mirrored !== undefined && sha256(mirrored) === asset.sha256) {
      console.log(`ok       ${platform} ${asset.name}`);
      continue;
    }
    if (verifyOnly) {
      console.log(`missing  ${platform} ${asset.name}`);
      failed += 1;
      continue;
    }
    const bytes = await download(`${github}/${asset.name}`);
    if (sha256(bytes) !== asset.sha256) throw new Error(`${asset.name}: checksum mismatch`);
    const file = join(work, asset.name);
    writeFileSync(file, bytes);
    console.log(
      `uploading ${index + 1}/${entries.length} ${asset.name} (${(bytes.length / 1048576).toFixed(1)} MB)`,
    );
    for (let attempt = 1; ; attempt += 1) {
      try {
        execFileSync(
          'npx',
          [
            'wrangler',
            'r2',
            'object',
            'put',
            `${bucket}/${prefix}/${asset.name}`,
            '--file',
            file,
            '--remote',
            '--content-type',
            'application/gzip',
            '--cache-control',
            'public, max-age=31536000, immutable',
          ],
          {
            stdio: 'inherit',
            env: {
              ...process.env,
              CLOUDFLARE_ACCOUNT_ID:
                process.env.CLOUDFLARE_ACCOUNT_ID ?? '332e72d480d7cb3e60ee671d3ca0cad0',
              NODE_OPTIONS:
                `${process.env.NODE_OPTIONS ?? ''} --no-network-family-autoselection --dns-result-order=ipv4first`.trim(),
            },
            shell: false,
            windowsHide: true,
          },
        );
        break;
      } catch (error) {
        if (attempt >= 3) throw error;
        console.log(`retrying upload of ${asset.name} (attempt ${attempt + 1} of 3)`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
      }
    }
    rmSync(file);
    const uploaded = await download(mirrorUrl(asset.name));
    if (sha256(uploaded) !== asset.sha256)
      throw new Error(`${asset.name}: mirror checksum mismatch`);
    console.log(`uploaded ${platform} ${asset.name}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failed > 0) process.exitCode = 1;
