import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { within } from '../workspaces/space-paths.js';

export interface ShellReachHost {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly execPath: string;
  readonly homedir: string;
  readonly linuxMountInfo?: string;
  exists(path: string): boolean;
  realpath(path: string): string;
  isSymlink(path: string): boolean;
  isExecutable(path: string): boolean;
  links(dir: string): string[];
  readlink(path: string): string;
}

export const nodeShellReachHost: ShellReachHost = {
  get env() {
    return process.env;
  },
  get execPath() {
    return process.execPath;
  },
  get homedir() {
    return homedir();
  },
  get linuxMountInfo() {
    if (process.platform !== 'linux') return '';
    try {
      return readFileSync('/proc/self/mountinfo', 'utf8');
    } catch {
      return '';
    }
  },
  exists: existsSync,
  realpath: (path) => realpathSync(path),
  isSymlink: (path) => {
    try {
      return lstatSync(path).isSymbolicLink();
    } catch {
      return false;
    }
  },
  isExecutable: (path) => {
    try {
      const stat = statSync(path);
      return stat.isFile() && (stat.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  },
  links: (dir) => {
    try {
      return readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isSymbolicLink())
        .map((entry) => join(dir, entry.name));
    } catch {
      return [];
    }
  },
  readlink: (path) => readlinkSync(path),
};

export type ShellNetwork = 'filtered';

export interface ShellEnv {
  set: Record<string, string>;
  unset: string[];
  secretPattern: string;
}

export interface ShellReach {
  readable: string[];
  writable: string[];
  hidden: string[];
  tools: string[];
  home: string;
  resolvConf?: string | undefined;
  env: ShellEnv;
  network: ShellNetwork;
}

export interface ShellReachRequest {
  readable: readonly string[];
  writable: readonly string[];
  home: string;
  protected: readonly string[];
}

export const SECRET_ENV_PATTERN =
  '(^|_)(API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|COOKIE|AUTH)(_|$)|^DSH_|^DEEPSEEKBOT_HOST$';

const SYSTEM_HIDDEN = ['/home', '/root', '/run', '/mnt', '/media', '/srv', '/tmp'];
const TOOL_LISTS = ['PATH', 'NODE_PATH'] as const;
const RESOLVER = '/etc/resolv.conf';

export function secretEnvNames(env: Readonly<Record<string, string | undefined>>): string[] {
  const pattern = new RegExp(SECRET_ENV_PATTERN, 'iu');
  return Object.keys(env).filter((name) => pattern.test(name));
}

function outermost(paths: readonly string[]): string[] {
  const unique = [...new Set(paths)].sort((a, b) => a.length - b.length);
  return unique.filter((path, index) => !unique.slice(0, index).some((root) => within(root, path)));
}

function pathTokens(value: string): string[] {
  return value
    .split(/[:=,;\s]+/u)
    .filter((token) => token.startsWith('/') && !token.startsWith('//'));
}

function windowsDriveMounts(mountInfo: string): string[] {
  return mountInfo.split('\n').flatMap((line) => {
    const [mount, source] = line.split(' - ');
    const path = mount?.split(' ')[4];
    const [filesystem, , options] = source?.split(' ') ?? [];
    if (
      !path ||
      (filesystem !== 'drvfs' &&
        !(filesystem === '9p' && /(?:^|,)aname=drvfs(?:[;,]|$)/u.test(options ?? '')))
    )
      return [];
    return [path.replace(/\\([0-7]{3})/gu, (_, octal) => String.fromCharCode(parseInt(octal, 8)))];
  });
}

export function shellReach(
  request: ShellReachRequest,
  host: ShellReachHost = nodeShellReachHost,
): ShellReach {
  const real = (path: string) => {
    try {
      return host.realpath(path);
    } catch {
      return path;
    }
  };
  const readable = request.readable.map(real);
  const writable = request.writable.map(real);
  const home = real(request.home);
  const allowed = [...readable, home];
  const guarded = request.protected.map(real);
  const ownerHome = real(host.homedir);
  const hidden = outermost(
    [...guarded, ownerHome, ...SYSTEM_HIDDEN]
      .filter((path) => host.exists(path))
      .filter((path) => !allowed.includes(path)),
  );
  const isHidden = (path: string) => hidden.some((root) => within(root, path));
  const windowsMounts = windowsDriveMounts(host.linuxMountInfo ?? '');
  const isLinuxToolPath = (path: string) => !windowsMounts.some((root) => within(root, path));
  const tools: string[] = [];
  const reachable = (path: string) =>
    !isHidden(path) || [...allowed, ...writable, ...tools].some((root) => within(root, path));
  const bindable = (path: string) =>
    isHidden(path) &&
    !reachable(path) &&
    !guarded.some((root) => within(root, path)) &&
    ![...guarded, ownerHome, ...hidden].some((root) => within(path, root));
  const bind = (path: string) => {
    if (isLinuxToolPath(path) && bindable(path)) tools.push(path);
  };

  const nodeBin = dirname(host.execPath);
  const lists = Object.fromEntries(
    TOOL_LISTS.flatMap((name) => {
      const value = host.env[name];
      if (value === undefined) return [];
      const entries = value
        .split(':')
        .filter((entry) => entry.startsWith('/') && isLinuxToolPath(entry));
      return [[name, name === 'PATH' ? [...entries, nodeBin] : entries]];
    }),
  ) as Partial<Record<(typeof TOOL_LISTS)[number], string[]>>;
  for (const entry of [...Object.values(lists).flat(), dirname(nodeBin)])
    if (isLinuxToolPath(entry) && host.exists(entry)) bind(real(entry));
  for (const dir of new Set((lists.PATH ?? []).map(real))) {
    if (!isLinuxToolPath(dir) || !reachable(dir) || !host.exists(dir)) continue;
    for (const link of host.links(dir)) {
      let first: string;
      try {
        first = resolve(dirname(link), host.readlink(link));
      } catch {
        continue;
      }
      if (!isLinuxToolPath(first) || !isHidden(first)) continue;
      const target = real(link);
      if (target !== link && host.isExecutable(target)) bind(target);
    }
  }

  const set: Record<string, string> = {};
  for (const [name, entries] of Object.entries(lists))
    set[name] = [
      ...new Set(
        entries.map((entry) => (isHidden(entry) ? real(entry) : entry)).filter(isLinuxToolPath),
      ),
    ].join(':');
  Object.assign(set, {
    HOME: home,
    XDG_CACHE_HOME: `${home}/.cache`,
    XDG_CONFIG_HOME: `${home}/.config`,
    XDG_DATA_HOME: `${home}/.local/share`,
    XDG_STATE_HOME: `${home}/.local/state`,
    TMPDIR: '/tmp',
  });
  const secrets = new Set(secretEnvNames(host.env));
  const unset = Object.entries(host.env)
    .filter(([name, value]) => {
      if (name in set || value === undefined) return false;
      if (secrets.has(name)) return true;
      return pathTokens(value).some((token) => !reachable(token));
    })
    .map(([name]) => name)
    .sort();

  let resolvConf: string | undefined;
  if (host.exists(RESOLVER)) resolvConf = host.isSymlink(RESOLVER) ? real(RESOLVER) : RESOLVER;

  return {
    readable,
    writable,
    hidden,
    tools,
    home,
    resolvConf,
    env: { set, unset, secretPattern: SECRET_ENV_PATTERN },
    network: 'filtered',
  };
}
