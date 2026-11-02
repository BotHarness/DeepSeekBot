import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';
import { prepareDesktopZoomQa } from '../desktop-zoom-qa.mjs';

describe('isolated desktop zoom CLI access metadata', () => {
  it('refreshes private launch credentials on each Host boot and preserves existing Profile bundles', async () => {
    const root = mkdtempSync(join(tmpdir(), 'zoom-qa-test-'));
    try {
      const profile = join(root, 'home/profiles/desktop');
      mkdirSync(profile, { recursive: true });
      writeFileSync(
        join(profile, 'package.json'),
        JSON.stringify({
          dependencies: { example: '1.0.0' },
          dsh: { profile: { bundles: ['example'] } },
        }),
      );
      const paths = prepareDesktopZoomQa(root);
      prepareDesktopZoomQa(root);
      const plugin = await import(pathToFileURL(join(root, 'cli-access/index.mjs')).href);
      const context = {
        webServer: { getOrigin: () => 'http://127.0.0.1:3000' },
        connection: { authenticatedUrl: () => 'http://127.0.0.1:3000/?token=first-test-token' },
      };
      plugin.apply(context);
      if (process.platform !== 'win32') {
        expect(statSync(paths.tokenFile).mode & 0o777).toBe(0o600);
        expect(statSync(paths.infoFile).mode & 0o777).toBe(0o600);
      }
      expect(readFileSync(paths.infoFile, 'utf8')).not.toContain('first-test-token');
      context.connection.authenticatedUrl = () => 'http://127.0.0.1:3000/?token=next-test-token';
      plugin.apply(context);
      expect(readFileSync(paths.tokenFile, 'utf8')).toBe('next-test-token');
      expect(
        JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')).dsh.profile.bundles,
      ).toEqual(['example', '@botharness/desktop-zoom-qa']);
      context.webServer.getOrigin = () => 'http://0.0.0.0:3000';
      expect(() => plugin.apply(context)).toThrow('zoom-qa-requires-owned-loopback');
      expect(readFileSync(paths.tokenFile, 'utf8')).toBe('next-test-token');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
