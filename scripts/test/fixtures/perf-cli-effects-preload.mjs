import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { register, syncBuiltinESMExports } from 'node:module';
import { isMainThread } from 'node:worker_threads';

if (isMainThread) {
  const read = fs.readFileSync;
  fs.readFileSync = (file, ...args) => {
    const name = (file instanceof URL ? fileURLToPath(file) : String(file)).replaceAll('\\', '/');
    if (/\/packages\/core\/(?:dist|cli)\/index\.mjs$/u.test(name))
      return Buffer.from('unit-test artifact; no runtime qualification');
    return read(file, ...args);
  };
  syncBuiltinESMExports();
  register(import.meta.url);
}

const cli = `
  import fs from 'node:fs';
  export async function runBotCreateCli(argv, io) {
    const fixture = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--fixture') + 1], 'utf8'));
    const statePath = process.env.PERF_TEST_STATE;
    const callsPath = process.env.PERF_TEST_CALLS;
    const calls = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];
    calls.push(argv);
    fs.writeFileSync(callsPath, JSON.stringify(calls));
    const normalize = value => value === 'off' ? null : value === 'inherit' ? '@global' : value;
    let selected = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : normalize(fixture.from);
    let value;
    let code = 0;
    if (argv[0] === 'list') value = { bots: [{ id: fixture.bot }] };
    else if (argv[0] === 'approval-template-set') {
      const restore = argv[2] === fixture.from;
      if (!restore && process.env.PERF_TEST_FAILURE === 'set-throw')
        throw new Error('Unit worker failure');
      if (restore && process.env.PERF_TEST_FAILURE === 'restore-refusal') {
        code = 7;
        value = { error: { code: 'unit-restore-refused' } };
      } else {
        selected = normalize(argv[2]);
        fs.writeFileSync(statePath, JSON.stringify(selected));
        value = { bot: { approvalTemplate: selected } };
      }
    } else if (argv[0] === 'approval-templates') {
      value = selected === null && process.env.PERF_TEST_FAILURE === 'omitted-off'
        ? {} : { selected };
    } else throw new Error('Unexpected fixture command');
    io.stdout(JSON.stringify(value));
    return code;
  }
`;

export async function resolve(specifier, context, next) {
  const cliUrl = new URL('../../../packages/core/cli/index.mjs', import.meta.url).href;
  if (specifier === cliUrl)
    return { url: 'data:text/javascript,' + encodeURIComponent(cli), shortCircuit: true };
  return next(specifier, context);
}
