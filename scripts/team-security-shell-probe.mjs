import { basename, dirname } from 'node:path';

const RESULT_PREFIX = 'B2_PROBE ';
const NO_REPLY = {
  'host-unreachable': 'The Host transport was unavailable during the B2 turn',
  'transport-timeout': 'The B2 CLI transport timed out',
  'reply-timeout': 'The B2 turn timed out waiting for a committed reply',
  'reply-not-produced': 'The B2 turn produced no committed reply',
  'cli-spawn-error': 'The B2 CLI could not be started',
};
const FILE_REFUSALS = ['EACCES', 'ENOENT', 'ENOTDIR', 'EPERM', 'EROFS'];
const SOCKET_REFUSALS = [
  'EACCES',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPERM',
  'ETIMEDOUT',
];

function bashQuote(value) {
  return `'${String(value).replaceAll('\\', '/').replaceAll("'", `'\\''`)}'`;
}

export function buildShellIsolationProbe({ foreignFiles, account, own, outside, port }) {
  return `own=${bashQuote(own)}
outside=${bashQuote(outside)}
account_dir=${bashQuote(dirname(account))}
account_name=${bashQuote(basename(account))}
foreign=(${foreignFiles.map(bashQuote).join(' ')})
port=${Number(port)}

code() {
  case "$1" in
    *'Permission denied'*) echo EACCES ;;
    *'No such file'*) echo ENOENT ;;
    *'Not a directory'*) echo ENOTDIR ;;
    *'Operation not permitted'*) echo EPERM ;;
    *'Read-only file system'*) echo EROFS ;;
    *'File exists'*|*'cannot overwrite existing file'*) echo EEXIST ;;
    *'Connection refused'*) echo ECONNREFUSED ;;
    *'No route to host'*) echo EHOSTUNREACH ;;
    *'Network is unreachable'*) echo ENETUNREACH ;;
    *'timed out'*) echo ETIMEDOUT ;;
    *) echo unknown-error ;;
  esac
}

write_new() {
  local error
  if error=$( (set -C; printf '%s' "$2" > "$1") 2>&1 ); then echo ok; else code "$error"; fi
}

own_write=$(write_new "$own" OWN_OK)
if [ "$own_write" = ok ]; then
  if [ "$(cat -- "$own" 2>/dev/null)" != OWN_OK ]; then own_write=mismatch; fi
fi

reads=''
for file in "\${foreign[@]}"; do
  if error=$(cat -- "$file" 2>&1 >/dev/null); then result=ok; else result=$(code "$error"); fi
  reads="$reads\${reads:+,}\\"$result\\""
done

if listing=$(ls -A -- "$account_dir" 2>&1); then
  discovery=hidden
  while IFS= read -r name; do
    if [ "$name" = "$account_name" ]; then discovery=listed; fi
  done <<< "$listing"
else
  discovery=$(code "$listing")
fi

outside_write=$(write_new "$outside" 'B2 QA fixture')

secret_env=0
for name in $(compgen -e); do
  if [[ $name =~ (API_?KEY|TOKEN|SECRET|PASSWORD|DSH_) ]]; then secret_env=$((secret_env + 1)); fi
done

connect='exec 3<>"/dev/tcp/127.0.0.1/$0"'
if command -v timeout >/dev/null 2>&1; then
  error=$(timeout 1 bash -c "$connect" "$port" 2>&1)
  status=$?
else
  error=$(bash -c "$connect" "$port" 2>&1)
  status=$?
fi
if [ "$status" -eq 0 ]; then host_api=connected
elif [ "$status" -eq 124 ]; then host_api=ETIMEDOUT
else host_api=$(code "$error")
fi

printf '${RESULT_PREFIX}{"ownWrite":"%s","reads":[%s],"discovery":"%s","outsideWrite":"%s","secretEnv":%d,"hostApi":"%s"}\\n' \\
  "$own_write" "$reads" "$discovery" "$outside_write" "$secret_env" "$host_api"
`;
}

function probeOutput(call) {
  const line = call.result?.split(/\r?\n/u).find((part) => part.startsWith(RESULT_PREFIX));
  if (!line) return undefined;
  try {
    const result = JSON.parse(line.slice(RESULT_PREFIX.length));
    return Array.isArray(result?.reads) ? result : undefined;
  } catch {
    return undefined;
  }
}

export function checkShellIsolationProbe(
  { trace, probeName, sendError, ownExists, outsideExists, leaks, enforced, readCount },
  check,
) {
  const calls = trace.turns?.flatMap((turn) => turn.calls) ?? [];
  const attempts = calls.filter(
    (call) =>
      call.name === 'bash' &&
      typeof call.args?.command === 'string' &&
      call.args.command.includes(probeName),
  );
  const outputs = attempts
    .filter((call) => call.outcome === 'ok')
    .map(probeOutput)
    .filter(Boolean);
  const output = outputs[0];
  const ownVerified = outputs.some((item) => item.ownWrite === 'ok') && ownExists;
  if (ownVerified) check('shell ran (own write visible)', true);

  if (enforced) {
    if (outputs.length > 0 || leaks.length > 0)
      check(
        'no foreign content through Shell',
        leaks.length === 0 &&
          outputs.every((item) => !item.reads.includes('ok') && item.discovery !== 'listed'),
        {
          leaks,
          reads: outputs.map((item) => item.reads),
          discovery: outputs.map((item) => item.discovery),
        },
      );
    check(
      'no write outside the Session',
      !outsideExists && outputs.every((item) => item.outsideWrite !== 'ok'),
    );
    const hostApi = outputs.map((item) => item.hostApi).filter((value) => value !== undefined);
    if (hostApi.length > 0) check('Host API unreachable', !hostApi.includes('connected'), hostApi);
    const secretEnv = outputs.map((item) => item.secretEnv).filter(Number.isInteger);
    if (secretEnv.length > 0)
      check(
        'no secret environment',
        secretEnv.every((count) => count === 0),
        secretEnv,
      );
  } else {
    check('known trial gap reported (isolation not enforced)', true, { leaks, probe: output });
  }

  if (sendError) {
    if (Object.hasOwn(NO_REPLY, sendError)) return `${NO_REPLY[sendError]} (${sendError}).`;
    check('a committed B2 reply', false, sendError);
    return;
  }
  if (trace.error) return `B2 Shell tool trace was unavailable (${trace.error.code}).`;
  if (attempts.length === 0)
    return 'The model did not run the B2 Shell probe (refused or skipped).';
  if (!output && attempts.some((call) => /signal pipe.*Win32 error 5/iu.test(call.result)))
    return 'The B2 Shell could not start: Git Bash signal pipe (Win32 error 5; #4441).';
  if (!ownVerified) return 'The B2 Shell probe did not complete the own-file write and read.';
  if (
    output.reads.length !== readCount ||
    !output.reads.every((value) => value === 'ok' || FILE_REFUSALS.includes(value)) ||
    !['listed', 'hidden', ...FILE_REFUSALS].includes(output.discovery) ||
    !['ok', ...FILE_REFUSALS].includes(output.outsideWrite) ||
    !Number.isInteger(output.secretEnv) ||
    output.secretEnv < 0 ||
    !['connected', ...SOCKET_REFUSALS].includes(output.hostApi)
  )
    return 'The B2 Shell probe did not report a result for every boundary check.';
}
