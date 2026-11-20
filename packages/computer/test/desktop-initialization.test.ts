import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createDockerComputerProvider } from '../src/providers/docker.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bh-desktop-init-'));
  roots.push(root);
  const home = join(root, 'home');
  const defaults = join(root, 'defaults');
  const channels = join(home, '.config/xfce4/xfconf/xfce-perchannel-xml');
  mkdirSync(home);
  mkdirSync(defaults);
  writeFileSync(
    join(defaults, 'xfce4-panel.xml'),
    '<property name="icon-size" type="uint" value="16"/><property name="size" type="uint" value="26"/>',
  );
  writeFileSync(join(defaults, 'xfwm4.xml'), 'upstream window manager');
  writeFileSync(join(defaults, 'xsettings.xml'), 'upstream appearance');
  return { home, defaults, channels };
}

async function startWith(f: ReturnType<typeof fixture>, kind: 'volume' | 'bind') {
  const mounts: string[] = [];
  const events: string[] = [];
  const provider = createDockerComputerProvider({
    platform: () => 'linux',
    config: kind === 'bind' ? { dataDir: f.home } : { volumeName: 'desktop-init-test-home' },
    onEvent: (event) => events.push(event),
    fetchImpl: async () => new Response('ready'),
    runner: {
      async run(argv) {
        if (argv[1] === 'inspect') return { code: 1, stdout: '', stderr: 'No such container' };
        if (argv.includes('--rm')) {
          mounts.push(argv[argv.indexOf('-v') + 1] ?? '');
          const script = (argv.at(-1) ?? '')
            .replaceAll('/data', f.home)
            .replaceAll('/defaults/xfce', f.defaults);
          const sedCompatibility =
            process.platform === 'darwin' ? 'sed() { shift; command sed -i "" "$@"; }; ' : '';
          const userCompatibility =
            'chown() { if [ "$1" = "-R" ]; then shift; shift; command chown -R "$(id -u):$(id -g)" "$@"; else shift; command chown "$(id -u):$(id -g)" "$@"; fi; }; ';
          const result = spawnSync('sh', ['-c', userCompatibility + sedCompatibility + script], {
            encoding: 'utf8',
            shell: false,
            windowsHide: true,
          });
          return { code: result.status ?? 1, stdout: result.stdout, stderr: result.stderr };
        }
        return { code: 0, stdout: 'ok', stderr: '' };
      },
    },
  });
  await provider.start();
  return { mounts, events };
}

describe.skipIf(process.platform === 'win32')('desktop home initialization shell', () => {
  it.each(['volume', 'bind'] as const)(
    'prepares complete defaults and intended sizing on a fresh %s home',
    async (kind) => {
      const f = fixture();
      const result = await startWith(f, kind);
      expect(readFileSync(join(f.channels, 'xfce4-panel.xml'), 'utf8')).toContain('value="52"');
      expect(readFileSync(join(f.channels, 'xfce4-panel.xml'), 'utf8')).toContain('value="32"');
      expect(readFileSync(join(f.channels, 'xfwm4.xml'), 'utf8')).toBe('upstream window manager');
      expect(readFileSync(join(f.channels, 'xsettings.xml'), 'utf8')).toBe('upstream appearance');
      expect(result.mounts).toEqual([
        `${kind === 'bind' ? f.home : 'desktop-init-test-home'}:/data`,
      ]);
      expect(result.events).not.toContain('desktop defaults could not be prepared');
    },
  );

  it('preserves nonstandard settings and user files on repeated startup', async () => {
    const f = fixture();
    mkdirSync(f.channels, { recursive: true });
    const custom =
      '<property name="icon-size" type="uint" value="45"/><property name="size" type="uint" value="73"/>';
    writeFileSync(join(f.channels, 'xfce4-panel.xml'), custom);
    writeFileSync(join(f.channels, 'xfwm4.xml'), 'custom window manager');
    for (let attempt = 0; attempt < 2; attempt += 1) await startWith(f, 'volume');
    expect(readFileSync(join(f.channels, 'xfce4-panel.xml'), 'utf8')).toBe(custom);
    expect(readFileSync(join(f.channels, 'xfwm4.xml'), 'utf8')).toBe('custom window manager');
  });

  it('repairs a missing panel without replacing another existing configuration', async () => {
    const f = fixture();
    mkdirSync(f.channels, { recursive: true });
    writeFileSync(join(f.channels, 'xfwm4.xml'), 'custom window manager');
    await startWith(f, 'volume');
    expect(readFileSync(join(f.channels, 'xfce4-panel.xml'), 'utf8')).toContain('value="52"');
    expect(readFileSync(join(f.channels, 'xfwm4.xml'), 'utf8')).toBe('custom window manager');
  });

  it('leaves first-run initialization available when upstream defaults are missing', async () => {
    const f = fixture();
    rmSync(f.defaults, { recursive: true });
    const result = await startWith(f, 'volume');
    expect(result.events).toContain('desktop defaults could not be prepared');
    expect(() => readFileSync(join(f.channels, 'xfce4-panel.xml'))).toThrow();
    expect(existsSync(f.channels)).toBe(false);
  });
});
