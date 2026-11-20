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

export function buildShellIsolationProbe({ foreignFiles, account, own, outside, port }) {
  const fixture = {
    foreignFiles,
    accountDir: dirname(account),
    accountName: basename(account),
    own,
    outside,
    port: Number(port),
  };
  return `const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { createConnection } = require('node:net');
const { foreignFiles, accountDir, accountName, own, outside, port } = ${JSON.stringify(fixture)};

function status(operation) {
  try { return operation(); }
  catch (error) { return error.code ?? 'unknown-error'; }
}

function loopbackStatus() {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => finish('connected'));
    socket.once('error', (error) => finish(error.code ?? 'unknown-error'));
    socket.setTimeout(1000, () => finish('ETIMEDOUT'));
  });
}

async function run() {
  const ownWrite = status(() => {
    writeFileSync(own, 'OWN_OK', { flag: 'wx' });
    return readFileSync(own, 'utf8') === 'OWN_OK' ? 'ok' : 'mismatch';
  });
  const reads = foreignFiles.map((file) => status(() => {
    readFileSync(file);
    return 'ok';
  }));
  const discovery = status(() => readdirSync(accountDir).includes(accountName) ? 'listed' : 'hidden');
  const outsideWrite = status(() => {
    writeFileSync(outside, 'B2 QA fixture', { flag: 'wx' });
    return 'ok';
  });
  const secretEnv = Object.keys(process.env).filter((name) =>
    /API_?KEY|TOKEN|SECRET|PASSWORD|DSH_/u.test(name)).length;
  const hostApi = await loopbackStatus();
  console.log('${RESULT_PREFIX}' + JSON.stringify({ ownWrite, reads, discovery, outsideWrite, secretEnv, hostApi }));
}

run().catch((error) => {
  console.error(error.code ?? error.name);
  process.exitCode = 1;
});
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
