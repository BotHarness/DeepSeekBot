import * as childProcess from 'node:child_process';
import { execSync, spawn, spawnSync } from 'node:child_process';

const options = { cwd: '.' };

spawnSync('git', ['status']);
spawn('git', ['status'], { stdio: 'ignore' });
spawn('git', ['status'], { shell: true, windowsHide: true });
childProcess.execFileSync('git', ['status'], { encoding: 'utf8' });
execSync('git status');

spawnSync('git', ['status'], { windowsHide: true, shell: false });
spawn('explorer', ['.'], { windowsHide: false, detached: true });
spawn('git', ['status'], { ...options });
spawnSync('git', ['status'], options);
childProcess.execFile('git', ['status'], { windowsHide: true }, () => {});

const args = ['status'];
childProcess.execFile('git', ['status'], () => {});
spawn('git', args);
const hidden = { shell: false, windowsHide: true };
spawn('git', hidden);
const visible = { stdio: 'ignore' };
spawn('git', visible);
const { picked } = { picked: { shell: false, windowsHide: true } };
spawn('git', picked);
const assigned = { shell: false };
assigned.windowsHide = true;
spawn('git', assigned);

export function run(spawnSync) {
  spawnSync('task');
}
