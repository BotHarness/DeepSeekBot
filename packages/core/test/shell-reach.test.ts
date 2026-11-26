import { describe, expect, it } from 'vitest';

import { shellReach, type ShellReachHost } from '../src/execution/shell-reach.js';

function fakeHost(options: {
  env: Record<string, string>;
  dirs: string[];
  files?: string[];
  data?: string[];
  links?: Record<string, string>;
}): ShellReachHost {
  const links = options.links ?? {};
  const data = new Set(options.data ?? []);
  const files = new Set([...(options.files ?? []), ...data]);
  const dirs = new Set(['/', '/home', '/run', '/tmp', '/srv', ...options.dirs]);
  const resolve = (path: string): string => {
    const parts = path.split('/').filter(Boolean);
    let current = '';
    for (let index = 0; index < parts.length; index += 1) {
      current = `${current}/${parts[index]}`;
      const target = links[current];
      if (target !== undefined)
        return resolve([target, ...parts.slice(index + 1)].join('/').replace(/\/+/gu, '/'));
    }
    return current === '' ? '/' : current;
  };
  return {
    env: options.env,
    execPath: '/opt/node/bin/node',
    homedir: '/home/owner',
    exists: (path) => {
      const target = resolve(path);
      return dirs.has(target) || files.has(target);
    },
    realpath: (path) => {
      const target = resolve(path);
      if (!dirs.has(target) && !files.has(target)) throw new Error(`ENOENT ${path}`);
      return target;
    },
    isSymlink: (path) => links[path] !== undefined,
    isExecutable: (path) => files.has(resolve(path)) && !data.has(resolve(path)),
    readlink: (path) => {
      const target = links[path];
      if (target === undefined) throw new Error(`EINVAL ${path}`);
      return target;
    },
    links: (dir) =>
      Object.keys(links).filter(
        (path) => path.startsWith(`${dir}/`) && !path.slice(dir.length + 1).includes('/'),
      ),
  };
}

const request = {
  readable: ['/srv/dsh/spaces/alice/bots/ada/memory', '/srv/work/alpha'],
  writable: ['/srv/dsh/spaces/alice/bots/ada/memory'],
  home: '/srv/dsh/spaces/alice/bots/ada/home',
  protected: ['/srv/dsh', '/srv/work/beta'],
};
const dirs = [
  '/home/owner',
  '/srv/dsh',
  '/srv/dsh/spaces/alice/bots/ada/memory',
  '/srv/dsh/spaces/alice/bots/ada/home',
  '/srv/work',
  '/srv/work/alpha',
  '/srv/work/beta',
  '/opt/node/bin',
  '/usr/bin',
];

describe('Shell reach', () => {
  it('hides the Owner home, the Host data, other spaces and /tmp but not the Session roots', () => {
    const reach = shellReach(request, fakeHost({ env: { PATH: '/usr/bin' }, dirs }));
    expect(reach.hidden).toEqual(expect.arrayContaining(['/home', '/run', '/srv', '/tmp']));
    expect(reach.readable).toEqual(request.readable);
    expect(reach.env.set).toMatchObject({ HOME: request.home, TMPDIR: '/tmp' });
  });

  it('rewrites a PATH entry that is a link into a hidden root and binds the real directory', () => {
    const fnm = '/home/owner/.local/share/fnm/node-versions/v24/installation/bin';
    const reach = shellReach(
      request,
      fakeHost({
        env: { PATH: '/run/user/1000/fnm_multishells/42/bin:/usr/bin' },
        dirs: [...dirs, '/run/user/1000/fnm_multishells', fnm],
        links: {
          '/run/user/1000/fnm_multishells/42':
            '/home/owner/.local/share/fnm/node-versions/v24/installation',
        },
      }),
    );
    expect(reach.env.set['PATH']).toBe(`${fnm}:/usr/bin:/opt/node/bin`);
    expect(reach.tools).toContain(fnm);
  });

  it('binds only the target file of a single-file link inside a PATH directory', () => {
    const versions = '/home/owner/.local/share/claude/versions';
    const reach = shellReach(
      request,
      fakeHost({
        env: { PATH: '/home/owner/.local/bin:/usr/bin' },
        dirs: [...dirs, '/home/owner/.local/bin', versions],
        files: [`${versions}/2.1`],
        data: [`${versions}/notes.txt`, '/home/owner/.ssh/id_ed25519'],
        links: {
          '/home/owner/.local/bin/claude': `${versions}/2.1`,
          '/home/owner/.local/bin/notes': `${versions}/notes.txt`,
          '/home/owner/.local/bin/key': '/home/owner/.ssh/id_ed25519',
        },
      }),
    );
    expect(reach.tools).toContain('/home/owner/.local/bin');
    expect(reach.tools).toContain(`${versions}/2.1`);
    expect(reach.tools).not.toContain(versions);
    expect(reach.tools).not.toContain(`${versions}/notes.txt`);
    expect(reach.tools).not.toContain('/home/owner/.ssh/id_ed25519');
  });

  it('never binds a tool inside the Host data or another space, or a parent of them', () => {
    const reach = shellReach(
      request,
      fakeHost({
        env: { PATH: '/home/owner/bin:/srv/dsh/bin:/srv/work/beta/bin:/srv:/usr/bin' },
        dirs: [...dirs, '/home/owner/bin', '/srv/dsh/bin', '/srv/work/beta/bin'],
        files: ['/srv/dsh/credential-helper'],
        links: { '/home/owner/bin/helper': '/srv/dsh/credential-helper' },
      }),
    );
    expect(reach.tools).toContain('/home/owner/bin');
    expect(reach.tools).not.toContain('/srv/dsh/bin');
    expect(reach.tools).not.toContain('/srv/work/beta/bin');
    expect(reach.tools).not.toContain('/srv');
    expect(reach.tools).not.toContain('/srv/dsh/credential-helper');
  });

  it('drops secrets and variables pointing into hidden roots and keeps reachable paths', () => {
    const reach = shellReach(
      request,
      fakeHost({
        env: {
          PATH: '/usr/bin',
          SSH_AUTH_SOCK: '/run/user/1000/keyring/ssh',
          XDG_RUNTIME_DIR: '/run/user/1000',
          DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus',
          OPENCODE_GO_API_KEY: 'sk-test',
          NVM_DIR: '/home/owner/.nvm',
          HOME: '/home/owner',
          LANG: 'C.UTF-8',
          EDITOR: '/usr/bin/vi',
          WORK: '/srv/work/alpha',
          HTTPS_PROXY: 'http://proxy.example:3128',
        },
        dirs,
      }),
    );
    expect(reach.env.unset).toEqual([
      'DBUS_SESSION_BUS_ADDRESS',
      'NVM_DIR',
      'OPENCODE_GO_API_KEY',
      'SSH_AUTH_SOCK',
      'XDG_RUNTIME_DIR',
    ]);
    expect(reach.env.set['HOME']).toBe(request.home);
  });

  it('rewrites NODE_PATH like PATH', () => {
    const modules = '/home/owner/.local/share/fnm/node-versions/v24/installation/lib/node_modules';
    const reach = shellReach(
      request,
      fakeHost({
        env: { PATH: '/usr/bin', NODE_PATH: '/run/user/1000/fnm_multishells/42/lib/node_modules' },
        dirs: [...dirs, '/run/user/1000/fnm_multishells', modules],
        links: {
          '/run/user/1000/fnm_multishells/42':
            '/home/owner/.local/share/fnm/node-versions/v24/installation',
        },
      }),
    );
    expect(reach.env.set['NODE_PATH']).toBe(modules);
    expect(reach.tools).toContain(modules);
  });
});
