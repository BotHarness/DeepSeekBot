import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const identifier = 'com.botharness.computer-unlock';
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(homedir(), 'Library', 'Application Support', 'BotHarness', 'ComputerUnlock');
const plistDirectory = join(homedir(), 'Library', 'LaunchAgents');
const plist = join(plistDirectory, identifier + '.plist');
const executable = join(directory, 'ComputerUnlockAgent');
const socket = join(tmpdir(), 'botharness-computer-unlock.sock');
const domain = 'gui/' + process.getuid?.();
const [operation, identity, ...rest] = process.argv.slice(2);

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `${command} failed`);
  return result.stdout;
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

if (
  process.platform !== 'darwin' ||
  process.getuid?.() === 0 ||
  rest.length > 0 ||
  !(operation === 'install' || (operation === 'stop' && identity === undefined))
)
  throw new Error(
    'Run as the console user. Usage: install-computer-unlock-macos.mjs install <certificate SHA-1> | stop',
  );

if (operation === 'stop') {
  run('/bin/launchctl', ['bootout', domain + '/' + identifier]);
} else {
  const identities = run('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
  if (
    !identity ||
    !/^[A-Fa-f0-9]{40}$/u.test(identity) ||
    !identities
      .split('\n')
      .some(
        (line) =>
          line.includes(identity.toUpperCase()) &&
          /"(?:Apple Development|Developer ID Application):/u.test(line),
      )
  )
    throw new Error(
      'Install a valid Apple Development or Developer ID Application certificate and private key in your login Keychain.',
    );
  if (Buffer.byteLength(socket) >= 104)
    throw new Error('The macOS user temporary socket path is too long.');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  mkdirSync(plistDirectory, { recursive: true });
  const work = mkdtempSync(join(directory, '.build-'));
  try {
    const binary = join(work, 'ComputerUnlockAgent');
    const source = join(root, 'packages', 'computer', 'native', 'unlock');
    run('/usr/bin/xcrun', [
      'swiftc',
      '-swift-version',
      '5',
      '-O',
      '-import-objc-header',
      join(source, 'Launchd.h'),
      join(root, 'apps', 'mobile', 'modules', 'computer-unlock', 'ios', 'UnlockWire.swift'),
      ...[
        'MacScreenUnlock',
        'MacSystemAccount',
        'MacUnlockIdentity',
        'MacUnlockServer',
        'UnlockAgent',
      ].map((name) => join(source, name + '.swift')),
      '-o',
      binary,
    ]);
    run('/usr/bin/codesign', [
      '--force',
      '--options',
      'runtime',
      '--sign',
      identity,
      '--identifier',
      identifier,
      binary,
    ]);
    run('/usr/bin/codesign', ['--verify', '--strict', binary]);
    if (existsSync(executable)) {
      const signed = spawnSync('/usr/bin/codesign', ['--display', '-r-', binary], {
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      });
      const requirement = /^designated => (.+)$/mu.exec(signed.stdout)?.[1];
      if (!requirement || signed.status !== 0)
        throw new Error('Could not read the signing requirement.');
      run('/usr/bin/codesign', ['--verify', '--strict', '-R=' + requirement, executable]);
    }

    const token = join(directory, 'ipc-token');
    if (!existsSync(token)) writeFileSync(token, randomBytes(32), { flag: 'wx', mode: 0o600 });
    const configuration = join(work, 'ComputerUnlockAgent.plist');
    writeFileSync(
      configuration,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${identifier}</string>
  <key>LimitLoadToSessionType</key><string>Aqua</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProgramArguments</key>
  <array><string>${escapeXml(executable)}</string><string>${escapeXml(directory)}</string><string>${escapeXml(socket)}</string></array>
  <key>MachServices</key>
  <dict><key>${identifier}</key><true/></dict>
</dict>
</plist>
`,
    );
    run('/usr/bin/plutil', ['-lint', configuration]);
    const service = domain + '/' + identifier;
    const running =
      spawnSync('/bin/launchctl', ['print', service], {
        stdio: 'ignore',
        shell: false,
        windowsHide: true,
      }).status === 0;
    const sameJob =
      running && existsSync(plist) && readFileSync(plist).equals(readFileSync(configuration));
    if (running && !sameJob) run('/bin/launchctl', ['bootout', service]);
    chmodSync(binary, 0o700);
    renameSync(binary, executable);
    if (sameJob) {
      run('/bin/launchctl', ['kickstart', '-k', service]);
    } else {
      renameSync(configuration, plist);
      for (let attempt = 0; ; attempt++) {
        try {
          run('/bin/launchctl', ['bootstrap', domain, plist]);
          break;
        } catch (error) {
          if (attempt >= 4 || !String(error).includes('Bootstrap failed: 5:')) throw error;
          await delay(200);
        }
      }
    }
    process.stdout.write(
      'Computer Unlock helper installed. Enable its Accessibility permission in System Settings.\n',
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
