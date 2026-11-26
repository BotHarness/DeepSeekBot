import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const [device] = process.argv.slice(2);
assert(device, 'Pass the bound Android agent-device command with a pending Shell card visible.');

function run(...args) {
  return execFileSync(device, args, {
    encoding: 'utf8',
    timeout: 15_000,
    shell: false,
    windowsHide: true,
  });
}

function keyboard() {
  const { data } = JSON.parse(run('keyboard', 'status', '--json'));
  assert.equal(data.platform, 'android');
  assert(data.inputMethodPackage, 'Enable a real on-screen keyboard before running this check.');
  assert.notEqual(data.inputMethodPackage, 'com.callstack.agentdevice.imehelper');
  return data;
}

function ref(line) {
  const target = run('snapshot', '-i')
    .split('\n')
    .find((entry) => line.test(entry))
    ?.split(' ')[0];
  assert(target, `No visible control matching ${line}`);
  return target;
}

assert.equal(keyboard().visible, false, 'Dismiss the keyboard before opening the scope menu.');
const alwaysAllow = ref(/^@\S+ \[button\] "(?:始终允许|Always allow)"$/);
run('longpress', alwaysAllow, '950', '--settle');
run('press', ref(/^@\S+ .*"(?:自定义|Custom)…/), '--settle');

for (let attempt = 0; attempt < 10; attempt += 1) {
  const status = keyboard();
  if (status.visible && status.inputOwner === 'app' && status.type === 'text') {
    ref(/^@\S+ \[text-field\].*\[focused\]/);
    process.stdout.write(
      'The custom Shell scope opened with a focused field and a visible keyboard.\n',
    );
    process.exit(0);
  }
  await delay(200);
}

assert.fail('The custom Shell scope did not open the keyboard automatically.');
