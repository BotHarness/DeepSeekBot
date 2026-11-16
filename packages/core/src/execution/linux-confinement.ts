import { spawnSync } from 'node:child_process';

export type ConfinementEnforcement = 'full' | 'partial' | 'unavailable';
export interface ConfinementStatus {
  enforcement: ConfinementEnforcement;
  filesystem: boolean;
  network: boolean;
  missing: string[];
}

export interface ExecutionPlan {
  readable: string[];
  writable: string[];
  hidden: string[];
  tools?: string[] | undefined;
  home: string;
  resolvConf?: string | undefined;
}

export const RUNNER_FAILURE_SIGNATURE = 'bh-confine: ';
export const DENIAL_SIGNATURES = ['read-only file system', 'permission denied'] as const;

export const NETWORK_RULES = `table inet botharness {
  chain output {
    type filter hook output priority 0; policy accept;
    ip daddr 10.0.2.3 meta l4proto { tcp, udp } th dport 53 accept
    oifname "lo" accept
    ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/3 } goto deny
    ip6 daddr { ::/127, ::ffff:0:0/96, fc00::/7, fe80::/10, ff00::/8 } goto deny
  }
  chain deny {
    meta l4proto tcp reject with tcp reset
    reject
  }
}
`;

export const NETWORK_RUNNER = String.raw`set -u
fail() { echo "bh-confine: $1" >&2; exit 125; }
dir=$(mktemp -d) || fail "cannot create a private runtime directory"
cleanup() { [ -n "\${slirp:-}" ] && kill "$slirp" 2>/dev/null; rm -rf "$dir"; }
trap cleanup EXIT
trap 'kill -TERM "\${child:-0}" 2>/dev/null' TERM INT HUP
rules=$1
shift
nft=$(PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin" command -v nft) || fail "nft is not installed"
ipcmd=$(PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin" command -v ip) || ipcmd=ip
printf 'nameserver 10.0.2.3\n' > "$dir/resolv.conf" || fail "cannot create a private resolver file"
mkfifo "$dir/go" || fail "cannot create a synchronisation pipe"
unshare --user --map-root-user --net --kill-child -- /bin/sh -c '
  read -r ready < "$1/go"
  [ "$ready" = go ] || { echo "bh-confine: network setup was not confirmed" >&2; exit 125; }
  "$4" link set lo up 2>/dev/null
  n=0
  until grep -q tap0 /proc/net/route; do
    n=$((n + 1))
    [ "$n" -gt 250 ] && { echo "bh-confine: the private network has no route" >&2; exit 125; }
    sleep 0.02
  done
  printf "%s" "$2" | "$3" -f - || { echo "bh-confine: network rules were refused" >&2; exit 125; }
  "$3" list table inet botharness >/dev/null 2>&1 || { echo "bh-confine: network rules are not active" >&2; exit 125; }
  exec 9< "$1/resolv.conf" || { echo "bh-confine: the private resolver file is missing" >&2; exit 125; }
  shift 4
  exec "$@"
' bh-confine "$dir" "$rules" "$nft" "$ipcmd" "$@" &
child=$!
host=$(readlink /proc/self/ns/net)
i=0
while [ "$(readlink "/proc/$child/ns/net" 2>/dev/null)" = "$host" ]; do
  i=$((i + 1))
  if [ "$i" -gt 250 ] || ! kill -0 "$child" 2>/dev/null; then
    kill -KILL "$child" 2>/dev/null
    fail "the private network namespace did not start"
  fi
  sleep 0.02
done
slirp4netns --configure --mtu=65520 --disable-host-loopback --ready-fd=3 "$child" tap0 3>"$dir/ready" >"$dir/slirp.log" 2>&1 &
slirp=$!
i=0
while [ ! -s "$dir/ready" ]; do
  i=$((i + 1))
  if [ "$i" -gt 250 ] || ! kill -0 "$slirp" 2>/dev/null; then
    kill -KILL "$child" 2>/dev/null
    fail "the private network did not start"
  fi
  sleep 0.02
done
printf 'go\n' > "$dir/go"
wait "$child"
`;

export const SECRET_ENV_PATTERN =
  '(^|_)(API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIALS?|COOKIE|AUTH)(_|$)|^DSH_|^DEEPSEEKBOT_HOST$';

export const ENV_SCRUB = String.raw`for name in $(env | sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' | grep -Ei "$1"); do unset "$name" 2>/dev/null; done
shift
exec "$@"
`;

export function secretEnvNames(env: NodeJS.ProcessEnv): string[] {
  const pattern = new RegExp(SECRET_ENV_PATTERN, 'iu');
  return Object.keys(env).filter((name) => pattern.test(name));
}

export function bwrapArgs(
  plan: ExecutionPlan,
  mode: 'read-only' | 'workspace-write',
  network = false,
): string[] {
  const args = [
    '--ro-bind',
    '/',
    '/',
    '--dev',
    '/dev',
    '--unshare-user',
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
    '--unshare-cgroup-try',
    '--proc',
    '/proc',
    '--die-with-parent',
    '--new-session',
  ];
  for (const path of plan.hidden) args.push('--tmpfs', path);
  args.push('--tmpfs', '/tmp');
  if (plan.resolvConf !== undefined)
    args.push(
      ...(network
        ? ['--ro-bind-data', '9', plan.resolvConf]
        : ['--ro-bind-try', plan.resolvConf, plan.resolvConf]),
    );
  for (const path of plan.tools ?? []) args.push('--ro-bind-try', path, path);
  const writable = new Set(mode === 'workspace-write' ? plan.writable : []);
  for (const path of plan.readable) if (!writable.has(path)) args.push('--ro-bind', path, path);
  for (const path of writable) args.push('--bind', path, path);
  if (mode === 'workspace-write' && !writable.has(plan.home))
    args.push('--bind', plan.home, plan.home);
  else if (!writable.has(plan.home)) args.push('--ro-bind', plan.home, plan.home);
  args.push(
    '--setenv',
    'HOME',
    plan.home,
    '--setenv',
    'XDG_CACHE_HOME',
    `${plan.home}/.cache`,
    '--setenv',
    'XDG_CONFIG_HOME',
    `${plan.home}/.config`,
    '--setenv',
    'XDG_DATA_HOME',
    `${plan.home}/.local/share`,
    '--setenv',
    'XDG_STATE_HOME',
    `${plan.home}/.local/state`,
    '--setenv',
    'TMPDIR',
    '/tmp',
  );
  return args;
}

export function confinedArgv(
  plan: ExecutionPlan,
  mode: 'read-only' | 'workspace-write',
  argv: readonly string[],
  network: boolean,
): string[] {
  const inner = [
    'bwrap',
    ...bwrapArgs(plan, mode, network),
    '--',
    '/bin/sh',
    '-c',
    ENV_SCRUB,
    'bh-scrub',
    SECRET_ENV_PATTERN,
    ...argv,
  ];
  return network ? ['/bin/sh', '-c', NETWORK_RUNNER, 'bh-confine', NETWORK_RULES, ...inner] : inner;
}

type Spawn = typeof spawnSync;

function runs(spawn: Spawn, argv: string[]): { ok: boolean; output: string } {
  const result = spawn(argv[0]!, argv.slice(1), {
    encoding: 'utf8',
    timeout: 10_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    ok: result.status === 0 && result.error === undefined,
    output: `${result.stdout ?? ''}`,
  };
}

export function probeConfinement(
  spawn: Spawn = spawnSync,
  platform: NodeJS.Platform = process.platform,
): ConfinementStatus {
  if (platform !== 'linux')
    return { enforcement: 'unavailable', filesystem: false, network: false, missing: ['linux'] };
  const plan: ExecutionPlan = {
    readable: [],
    writable: [],
    hidden: [],
    home: '/tmp',
  };
  const filesystem = runs(spawn, confinedArgv(plan, 'read-only', ['/bin/true'], false)).ok;
  if (!filesystem)
    return {
      enforcement: 'unavailable',
      filesystem: false,
      network: false,
      missing: ['bwrap'],
    };
  const tools = ['unshare', 'slirp4netns', 'nft'].filter(
    (tool) =>
      !runs(spawn, [
        '/bin/sh',
        '-c',
        `PATH="$PATH:/usr/local/sbin:/usr/sbin:/sbin" command -v ${tool}`,
      ]).ok,
  );
  const network =
    tools.length === 0 &&
    runs(
      spawn,
      confinedArgv(
        plan,
        'read-only',
        ['/bin/sh', '-c', 'cat /proc/net/route | tail -n +2 | grep -q . && echo routed'],
        true,
      ),
    ).output.includes('routed');
  return {
    enforcement: network ? 'full' : 'partial',
    filesystem: true,
    network,
    missing: network ? [] : tools.length ? tools : ['network-namespace'],
  };
}
