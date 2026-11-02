import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ACCOUNT = '332e72d480d7cb3e60ee671d3ca0cad0';
export const BUCKET = 'botharness-media';
export const PUBLIC_BASE = 'https://media.botharness.ai';
export const MAX_BYTES = 100 * 1024 * 1024;
const TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.html': 'application/octet-stream',
};

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function evidenceObject({ filename, bytes, sourceSha, reviewed }) {
  if (!reviewed) throw new Error('Confirm privacy review with --reviewed before public upload');
  if (!/^[a-f0-9]{40}$/.test(sourceSha ?? ''))
    throw new Error('--source-sha must identify the full, frozen source commit');
  const extension = extname(filename).toLowerCase();
  const contentType = TYPES[extension];
  if (!contentType) throw new Error('Unsupported evidence type; publish reviewed media or HTML');
  if (bytes.length === 0 || bytes.length > MAX_BYTES)
    throw new Error('Evidence must be nonempty and at most 100 MiB; trim larger recordings');
  const digest = sha256(bytes);
  const key = `pr/${sourceSha.slice(0, 12)}/${digest}${extension}`;
  return {
    version: 1,
    bucket: BUCKET,
    key,
    url: `${PUBLIC_BASE}/${key}`,
    sourceSha,
    sha256: digest,
    bytes: bytes.length,
    contentType,
    ...(extension === '.html' ? { contentDisposition: 'attachment; filename="review.html"' } : {}),
  };
}

export async function verifyEvidence(receipt, fetcher = fetch) {
  const response = await fetcher(receipt.url, {
    redirect: 'error',
    signal: AbortSignal.timeout(120_000),
    cache: 'no-store',
  });
  if (!response.ok || !response.body) throw new Error('Public R2 readback failed');
  if (response.headers.get('content-type')?.split(';')[0] !== receipt.contentType) {
    await response.body.cancel();
    throw new Error('Public R2 content type does not match');
  }
  if (
    receipt.contentDisposition &&
    response.headers.get('content-disposition') !== receipt.contentDisposition
  ) {
    await response.body.cancel();
    throw new Error('Public R2 download disposition does not match');
  }
  const digest = createHash('sha256');
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > receipt.bytes) throw new Error('Public R2 size does not match');
    digest.update(chunk);
  }
  if (length !== receipt.bytes || digest.digest('hex') !== receipt.sha256)
    throw new Error('Public R2 SHA-256 or size does not match');
}

export function uploadEvidence(receipt, bytes) {
  const wrangler = join(ROOT, 'packages/connect-relay/node_modules/wrangler/bin/wrangler.js');
  try {
    execFileSync(
      process.execPath,
      [
        wrangler,
        'r2',
        'object',
        'put',
        `${BUCKET}/${receipt.key}`,
        '--remote',
        '--pipe',
        '--content-type',
        receipt.contentType,
        ...(receipt.contentDisposition
          ? ['--content-disposition', receipt.contentDisposition]
          : []),
        '--cache-control',
        'public, max-age=31536000, immutable',
      ],
      {
        cwd: ROOT,
        input: bytes,
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024,
        timeout: 180_000,
        env: {
          ...process.env,
          CI: 'true',
          CLOUDFLARE_ACCOUNT_ID: ACCOUNT,
          WRANGLER_SEND_METRICS: 'false',
          NODE_OPTIONS:
            `${process.env.NODE_OPTIONS ?? ''} --no-network-family-autoselection --dns-result-order=ipv4first`.trim(),
        },
      },
    );
  } catch {
    throw new Error(
      'R2 upload failed; check local Wrangler installation and account access privately',
    );
  }
}

export async function publishEvidence(
  options,
  { upload = uploadEvidence, verify = verifyEvidence } = {},
) {
  const filename = resolve(options.filename);
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.size > MAX_BYTES)
    throw new Error('Evidence must be a regular file of at most 100 MiB');
  const bytes = readFileSync(filename);
  const receipt = evidenceObject({ ...options, filename, bytes });
  await upload(receipt, bytes);
  await verify(receipt);
  const receiptPath = `${filename}.r2.json`;
  try {
    if (lstatSync(receiptPath).isSymbolicLink()) throw new Error('Refusing a symlink receipt');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  if (options.removeLocal) {
    if (!lstatSync(filename).isFile() || sha256(readFileSync(filename)) !== receipt.sha256)
      throw new Error('Local evidence changed; retaining it instead of deleting');
    unlinkSync(filename);
  }
  return { ...receipt, localRemoved: Boolean(options.removeLocal) };
}

export function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--reviewed') options.reviewed = true;
    else if (argument === '--remove-local') options.removeLocal = true;
    else if (argument === '--file' || argument === '--source-sha') {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      options[argument === '--file' ? 'filename' : 'sourceSha'] = value;
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.filename) throw new Error('Provide --file, --source-sha and --reviewed');
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const receipt = await publishEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(receipt)}\n`);
  } catch (error) {
    process.stderr.write(`pr-evidence: ${error.message}\n`);
    process.exitCode = 1;
  }
}
