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
