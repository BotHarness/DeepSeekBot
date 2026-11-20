import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { localVideoHelperDirectory, LOCAL_VIDEO_ELECTRON_VERSION } from '../src/media/install.js';

afterEach(() => vi.unstubAllEnvs());
it('keeps the existing default helper directory', () => {
  vi.stubEnv('BOTHARNESS_LOCAL_VIDEO_HELPER_DIRECTORY', '');
  expect(localVideoHelperDirectory()).toBe(
    join(
      homedir(),
      '.botharness',
      'local-video',
      `electron-${LOCAL_VIDEO_ELECTRON_VERSION}-win32-x64`,
    ),
  );
});
it.skipIf(process.platform !== 'win32')(
  'accepts an absolute process-local helper directory and rejects relative paths',
  () => {
    vi.stubEnv('BOTHARNESS_LOCAL_VIDEO_HELPER_DIRECTORY', resolve('isolated-helper'));
    expect(localVideoHelperDirectory()).toBe(resolve('isolated-helper'));
    vi.stubEnv('BOTHARNESS_LOCAL_VIDEO_HELPER_DIRECTORY', 'relative/helper');
    expect(() => localVideoHelperDirectory()).toThrow('must be absolute');
  },
);
