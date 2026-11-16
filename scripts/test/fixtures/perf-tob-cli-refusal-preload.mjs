import cp from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import zlib from 'node:zlib';
if (process.env.PERF_TEST_CANCEL_MODE === 'decoder-unavailable')
  zlib.zstdDecompressSync = undefined;
let auditCalls = 0;
const read = fs.readFileSync;
const calls = [];
fs.readFileSync = (file, ...args) => {
  const name = (file instanceof URL ? fileURLToPath(file) : String(file)).replaceAll('\\', '/');
  if (/\/packages\/(?:core\/(?:dist|cli)\/index|deepseekbot\/dist\/deepseekbot)\.mjs$/u.test(name))
    return Buffer.from('unit-test artifact; no runtime qualification');
  return read(file, ...args);
};
cp.execFile = (executable, args, options, callback) => {
  if (
    executable !== process.execPath ||
    !args[0].replaceAll('\\', '/').endsWith('/packages/deepseekbot/dist/deepseekbot.mjs') ||
    options.shell !== false ||
    options.windowsHide !== true
  )
    throw new Error('Unit fixture refuses any real subprocess');
  const argv = args.slice(1);
  calls.push(argv);
  fs.writeFileSync(process.env.PERF_TEST_CALLS, JSON.stringify(calls));
  let value;
  if (argv[0] === 'tob-home') value = { botSlug: 'unit-tob' };
  else if (argv[0] === 'bot-trace') {
    auditCalls++;
    value = {
      sessionId:
        process.env.PERF_TEST_CANCEL_MODE === 'audit-after-oversize' && auditCalls > 1
          ? 'unit-session'
          : null,
    };
  } else if (argv[0] === 'approval-templates') value = { templates: [] };
  else if (argv[1] === 'start') value = { id: 'unit-request', state: 'running' };
  else if (argv[1] === 'status')
    value = {
      state: 'completed',
      result: { exitCode: 0, stdout: JSON.stringify({ templates: [] }) },
    };
  else if (argv[1] === 'cancel') value = { error: { code: 'unit-cancel-refusal' } };
  else throw new Error('Unexpected unit command');
  return {
    stdin: {
      end() {
        queueMicrotask(() => {
          const failed =
            argv[0] === 'tob-cli' &&
            argv[1] === 'cancel' &&
            ['coded-json', 'non-json'].includes(process.env.PERF_TEST_CANCEL_MODE);
          const output =
            failed && process.env.PERF_TEST_CANCEL_MODE === 'non-json'
              ? 'not-json'
              : JSON.stringify(value);
          callback(
            failed ? Object.assign(new Error('Unit refusal'), { code: 7 }) : null,
            output,
            '',
          );
        });
      },
    },
  };
};
syncBuiltinESMExports();
