import { describe, expect, it } from 'vitest';

import { buildLabel, clientBuild } from '../src/client/build-id.js';
import { buildStamp } from '../../../tsdown.config.js';

describe('client build id', () => {
  it('is dev when the bundle was not stamped', () => {
    expect(clientBuild()).toEqual({ sha: 'dev' });
    expect(buildLabel(clientBuild())).toBe('dev');
  });

  it('shows the SHA with the local build time', () => {
    const time = new Date(2026, 9, 15, 18, 5).toISOString();
    expect(buildLabel({ sha: '5456cecc1', time })).toBe('5456cecc1 · 2026-10-15 18:05');
  });

  it('stamps the bundle from env overrides, else git', () => {
    expect(
      buildStamp({ BOTHARNESS_BUILD_SHA: 'abc123', BOTHARNESS_BUILD_TIME: '2026-10-15T00:00:00Z' }),
    ).toEqual({
      sha: 'abc123',
      time: '2026-10-15T00:00:00Z',
    });
    expect(buildStamp({}).sha).toMatch(/^([0-9a-f]{9}|dev)$/);
  });
});
