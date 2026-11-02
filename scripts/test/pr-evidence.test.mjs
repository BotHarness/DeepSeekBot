import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  evidenceObject,
  MAX_BYTES,
  parseArgs,
  publishEvidence,
  sha256,
  verifyEvidence,
} from '../pr-evidence.mjs';
import { checkEvidence, evidenceViolations } from '../check-pr-evidence.mjs';

const sourceSha = '1234567890abcdef1234567890abcdef12345678';
const bytes = Buffer.from('reviewed synthetic test image');
const temporary = [];

function directory() {
  const root = mkdtempSync(join(tmpdir(), 'pr-evidence-test-'));
  temporary.push(root);
  return root;
}

function image() {
  const filename = join(directory(), 'after.png');
  writeFileSync(filename, bytes);
  return filename;
}

function object(overrides = {}) {
  return evidenceObject({ filename: 'after.png', sourceSha, bytes, reviewed: true, ...overrides });
}

afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('R2 evidence identity and publication boundaries', () => {
  it('binds public immutable URLs to source and full content hash, without private paths', () => {
    const receipt = object();
    expect(receipt.url).toBe(
      `https://media.botharness.ai/pr/${sourceSha.slice(0, 12)}/${sha256(bytes)}.png`,
    );
    expect(receipt.url.length).toBeLessThanOrEqual(150);
    expect(receipt.contentType).toBe('image/png');
    expect(receipt.bytes).toBe(bytes.length);
    expect(receipt.sourceSha).toBe(sourceSha);
    expect(receipt).not.toHaveProperty('filename');
    expect(object({ filename: '/private/another-name.png' })).toEqual(receipt);
    expect(object({ bytes: Buffer.from('other image') }).url).not.toBe(receipt.url);
  });

  it('requires privacy review and exact full source identity', () => {
    expect(() => object({ reviewed: false })).toThrow('--reviewed');
    for (const invalid of ['HEAD', 'main', sourceSha.slice(0, 12), '', undefined])
      expect(() => object({ sourceSha: invalid })).toThrow('--source-sha');
  });

  it('bounds memory/network work and rejects empty or executable/unknown artifacts', () => {
    expect(() => object({ bytes: Buffer.alloc(0) })).toThrow('nonempty');
    expect(() => object({ bytes: { length: MAX_BYTES + 1 } })).toThrow('100 MiB');
    for (const filename of ['archive.zip', 'capture.svg', 'secret.env', 'session.har'])
      expect(() => object({ filename })).toThrow('Unsupported');
    expect(object({ filename: 'clip.webm' }).contentType).toBe('video/webm');
    expect(object({ filename: 'shot.JPG' }).contentType).toBe('image/jpeg');
  });

  it('publishes reviewed HTML as a forced download, never as an executable shared-origin page', () => {
    const receipt = object({ filename: 'review.html' });
    expect(receipt.contentType).toBe('application/octet-stream');
    expect(receipt.contentDisposition).toBe('attachment; filename="review.html"');
  });

  it('rejects incomplete or unknown CLI options before publication', () => {
    expect(
      parseArgs(['--file', 'after.png', '--source-sha', sourceSha, '--reviewed', '--remove-local']),
    ).toEqual({ filename: 'after.png', sourceSha, reviewed: true, removeLocal: true });
    for (const args of [[], ['--file'], ['--file', '--reviewed'], ['--force']])
      expect(() => parseArgs(args)).toThrow();
  });
});

describe('public R2 readback', () => {
  it('requires the safe download headers for HTML artifacts', async () => {
    const receipt = object({ filename: 'review.html' });
    await expect(
      verifyEvidence(
        receipt,
        async () => new Response(bytes, { headers: { 'content-type': receipt.contentType } }),
      ),
    ).rejects.toThrow('download disposition');
    await verifyEvidence(
      receipt,
      async () =>
        new Response(bytes, {
          headers: {
            'content-type': receipt.contentType,
            'content-disposition': receipt.contentDisposition,
          },
        }),
    );
  });
  it('checks actual downloaded bytes and type, not merely a successful PUT or HEAD', async () => {
    const fetcher = vi.fn(
      async () => new Response(bytes, { headers: { 'content-type': 'image/png' } }),
    );
    await verifyEvidence(object(), fetcher);
    expect(fetcher).toHaveBeenCalledWith(
      object().url,
      expect.objectContaining({ redirect: 'error', cache: 'no-store' }),
    );
  });

  it.each([
    [404, 'image/png', bytes],
    [200, 'text/html', bytes],
    [200, 'image/png', Buffer.from('wrong')],
    [200, 'image/png', Buffer.alloc(bytes.length + 1)],
    [200, 'image/png', Buffer.alloc(bytes.length)],
  ])(
    'rejects failed/mistyped/truncated/oversized/corrupt readback %#',
    async (status, type, body) => {
      await expect(
        verifyEvidence(
          object(),
          async () => new Response(body, { status, headers: { 'content-type': type } }),
        ),
      ).rejects.toThrow('Public R2');
    },
  );
});

describe('local evidence lifecycle', () => {
  it('writes provenance and removes only the selected file after verified upload', async () => {
    const filename = image();
    const sibling = join(filename, '..', 'raw.png');
    writeFileSync(sibling, 'private original');
    const phases = [];
    const receipt = await publishEvidence(
      { filename, sourceSha, reviewed: true, removeLocal: true },
      {
        upload: async (entry, body) => {
          phases.push('upload');
          expect(body).toEqual(bytes);
          expect(entry.sha256).toBe(sha256(bytes));
          expect(existsSync(filename)).toBe(true);
        },
        verify: async () => {
          phases.push('verify');
          expect(existsSync(filename)).toBe(true);
          expect(existsSync(`${filename}.r2.json`)).toBe(false);
        },
      },
    );
    expect(phases).toEqual(['upload', 'verify']);
    expect(receipt.localRemoved).toBe(true);
    expect(existsSync(filename)).toBe(false);
    expect(readFileSync(sibling, 'utf8')).toBe('private original');
    expect(JSON.parse(readFileSync(`${filename}.r2.json`, 'utf8'))).toEqual(object());
  });

  it('retains the local file by default', async () => {
    const filename = image();
    const receipt = await publishEvidence(
      { filename, sourceSha, reviewed: true },
      { upload: async () => {}, verify: async () => {} },
    );
    expect(receipt.localRemoved).toBe(false);
    expect(readFileSync(filename)).toEqual(bytes);
  });

  it.each(['upload', 'verify'])(
    'retains originals and creates no success receipt on %s failure',
    async (phase) => {
      const filename = image();
      const failure = async () => {
        throw new Error('synthetic failure');
      };
      await expect(
        publishEvidence(
          { filename, sourceSha, reviewed: true, removeLocal: true },
          { upload: phase === 'upload' ? failure : async () => {}, verify: failure },
        ),
      ).rejects.toThrow('synthetic failure');
      expect(readFileSync(filename)).toEqual(bytes);
      expect(existsSync(`${filename}.r2.json`)).toBe(false);
    },
  );

  it('does not delete a file modified during upload/readback', async () => {
    const filename = image();
    await expect(
      publishEvidence(
        { filename, sourceSha, reviewed: true, removeLocal: true },
        { upload: async () => {}, verify: async () => writeFileSync(filename, 'new capture') },
      ),
    ).rejects.toThrow('Local evidence changed');
    expect(readFileSync(filename, 'utf8')).toBe('new capture');
  });

  it('refuses source and receipt symlinks', async () => {
    const filename = image();
    const linked = `${filename}-link.png`;
    symlinkSync(filename, linked);
    const upload = vi.fn();
    await expect(
      publishEvidence({ filename: linked, sourceSha, reviewed: true }, { upload }),
    ).rejects.toThrow('regular file');
    expect(upload).not.toHaveBeenCalled();
    symlinkSync(filename, `${filename}.r2.json`);
    await expect(
      publishEvidence(
        { filename, sourceSha, reviewed: true, removeLocal: true },
        { upload: async () => {}, verify: async () => {} },
      ),
    ).rejects.toThrow('symlink receipt');
    expect(readFileSync(filename)).toEqual(bytes);
  });
});

describe('Git evidence policy regression guard', () => {
  it('blocks evidence namespaces, not maintained assets, fixtures or small textual reports', () => {
    const bad = [
      '.github/pr-screenshots/123/after.PNG',
      '.github/pr-assets/123/clip.mp4',
      'docs/assets/pr/123/session.webm',
      'docs/qa/123/report.pdf',
      'docs/evidence/123/trace.zip',
      'docs/research/evidence/123/shot.png',
      '.humanlayer/tasks/private/manifest.json',
    ];
    expect(
      evidenceViolations([
        ...bad,
        'apps/mobile/assets/icon.png',
        'packages/core/test/fixtures/image.png',
        'docs/assets/guide.png',
        'docs/assets/pr/124-group-shell/runtime-proof.json',
        'docs/evidence/123/report.md',
      ]),
    ).toEqual(bad);
  });

  it('detects force-added, modified, renamed and committed evidence but permits legacy deletions', () => {
    const root = directory();
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
    const set = (path, text) => {
      const filename = join(root, path);
      mkdirSync(join(filename, '..'), { recursive: true });
      writeFileSync(filename, text);
    };
    git('init', '--initial-branch=main');
    git('config', 'user.name', 'Evidence test');
    git('config', 'user.email', 'evidence@example.invalid');
    set('.gitignore', '.github/pr-screenshots/\n.humanlayer/\n');
    set('.github/pr-screenshots/old.png', 'legacy image');
    git('add', '-f', '.gitignore', '.github/pr-screenshots/old.png');
    git('commit', '-m', 'Legacy baseline');
    const base = git('rev-parse', 'HEAD');
    expect(checkEvidence(root, base)).toEqual([]);
    set('.github/pr-screenshots/old.png', 'modified evidence');
    expect(checkEvidence(root, base)).toEqual(['.github/pr-screenshots/old.png']);
    git('restore', '.github/pr-screenshots/old.png');
    git('rm', '.github/pr-screenshots/old.png');
    set('.github/pr-screenshots/new.png', 'new image');
    git('add', '-f', '.github/pr-screenshots/new.png');
    expect(checkEvidence(root, base)).toEqual(['.github/pr-screenshots/new.png']);
    git('commit', '-m', 'Force-added evidence');
    expect(checkEvidence(root)).toEqual([]);
    expect(checkEvidence(root, base)).toEqual(['.github/pr-screenshots/new.png']);
    git('mv', '-f', '.github/pr-screenshots/new.png', '.github/pr-screenshots/renamed.png');
    expect(checkEvidence(root)).toEqual(['.github/pr-screenshots/renamed.png']);
    git('reset', '--hard', 'HEAD');
    git('rm', '.github/pr-screenshots/new.png');
    git('commit', '-m', 'Retire legacy evidence');
    expect(checkEvidence(root, base)).toEqual([]);
  });
});
