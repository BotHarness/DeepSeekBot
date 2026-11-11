import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkDshNpmAvailability } from '../dsh-npm-availability.mjs';

const version = '0.2.2-rc.2';
const reply = (status, body) => ({ status, ok: status === 200, json: async () => body });

describe('exact DSH npm distribution availability', () => {
  it('distinguishes an absent version from a missing package using official metadata', async () => {
    const urls = [];
    const report = await checkDshNpmAvailability(version, async (url) => {
      urls.push(url);
      if (url.endsWith(`/${version}`)) return reply(404);
      const name = decodeURIComponent(new URL(url).pathname.slice(1));
      return reply(200, {
        name,
        versions: { '0.2.2-rc.1': {} },
        'dist-tags': { next: '0.2.2-rc.1' },
      });
    });
    expect(report.ok).toBe(false);
    expect(report.packages.map((item) => item.state)).toEqual([
      'version-unavailable',
      'version-unavailable',
    ]);
    expect(report.packages[0]).toMatchObject({
      status: 404,
      packageStatus: 200,
      tags: { next: '0.2.2-rc.1' },
    });
    expect(urls).toHaveLength(4);
    expect(urls.every((url) => new URL(url).origin === 'https://registry.npmjs.org')).toBe(true);
  });

  it('does not call an unreachable, unauthorized or inconsistent registry unpublished', async () => {
    for (const status of [401, 403, 429, 500]) {
      const report = await checkDshNpmAvailability(version, async () => reply(status));
      expect(report.packages.every((item) => item.state === 'lookup-failed')).toBe(true);
    }
    const offline = await checkDshNpmAvailability(version, async () => {
      throw Error('private proxy detail');
    });
    expect(offline.packages[0].state).toBe('lookup-failed');
    expect(JSON.stringify(offline)).not.toContain('private proxy detail');
    const inconsistent = await checkDshNpmAvailability(version, async (url) =>
      url.endsWith(`/${version}`)
        ? reply(404)
        : reply(200, {
            name: decodeURIComponent(new URL(url).pathname.slice(1)),
            versions: { [version]: {} },
          }),
    );
    expect(inconsistent.packages[0].state).toBe('metadata-inconsistent');
  });

  it('requires exact manifest identity and labels success as metadata only', async () => {
    const available = await checkDshNpmAvailability(version, async (url) =>
      reply(200, {
        name: decodeURIComponent(new URL(url).pathname.split('/')[1]),
        version,
      }),
    );
    expect(available.ok).toBe(true);
    expect(available.scope).toBe('npm-metadata-only');
    const wrong = await checkDshNpmAvailability(version, async () =>
      reply(200, { name: 'other', version }),
    );
    expect(wrong.packages[0].state).toBe('metadata-inconsistent');
    const absent = await checkDshNpmAvailability(version, async () => reply(404));
    expect(absent.packages[0].state).toBe('package-unavailable');
  });

  it('rejects tags, ranges and path inputs before making a request', async () => {
    for (const value of ['next', '^0.2.2', '0.2.2-rc.2/extra', undefined]) {
      await expect(
        checkDshNpmAvailability(value, () => {
          throw Error('must not fetch');
        }),
      ).rejects.toThrow('exact SemVer');
    }
  });

  it('keeps invalid JSON and a failed package lookup inconclusive after an exact 404', async () => {
    for (const metadata of [
      reply(503),
      {
        status: 200,
        json: async () => {
          throw new SyntaxError('bad JSON');
        },
      },
    ]) {
      const report = await checkDshNpmAvailability(version, async (url) =>
        url.endsWith(`/${version}`) ? reply(404) : metadata,
      );
      expect(report.ok).toBe(false);
      expect(report.packages[0].state).toBe('lookup-failed');
    }
  });

  it('exits 2 without reporting availability for invalid command arguments', () => {
    const script = fileURLToPath(new URL('../dsh-npm-availability.mjs', import.meta.url));
    for (const args of [[], ['next'], [version, 'extra']]) {
      const result = spawnSync(process.execPath, [script, ...args], {
        encoding: 'utf8',
        windowsHide: true,
      });
      expect(result.status).toBe(2);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/Usage|exact SemVer/);
    }
  });
});
