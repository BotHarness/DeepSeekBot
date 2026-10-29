import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  inspectDesktopZoomApp,
  desktopZoomWindowsProcesses,
  desktopZoomPath,
  desktopZoomWindowsListener,
} from '../packages/deepseekbot/src/desktop-zoom-platform.mjs';
import { configureDesktopZoom } from '../packages/deepseekbot/src/desktop-zoom-setup.mjs';
import { prepareDesktopZoomQa } from './desktop-zoom-qa.mjs';
import { devSecretEnvironment } from './dev-secret.mjs';
import { connectZoomCdp } from './desktop-zoom-cdp.mjs';
import {
  packagedProfileManifest,
  packagedWorkspaceSettings,
  verifiedProductArtifacts,
  verifyPackagedProfile,
} from './packaged-profile.mjs';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [action, ...args] = process.argv.slice(2);
const values = new Map();
for (let index = 0; index < args.length; index += 2) {
  if (
    !['--root', '--app', '--artifacts'].includes(args[index]) ||
    !args[index + 1] ||
    values.has(args[index])
  )
    throw Error('zoom-windows-invalid-arguments');
  values.set(args[index], args[index + 1]);
}
if (process.platform !== 'win32') throw Error('zoom-windows-native-only');
if (
  !values.has('--root') ||
  !values.has('--app') ||
  !['start', 'stop', 'status', 'prepare', 'enable', 'disable'].includes(action)
)
  throw Error(
    'Usage: node scripts/e2e-desktop-zoom-windows.mjs start|stop|status|prepare|enable|disable --root <isolated-root> --app <exe> [--artifacts <candidate-directory>]',
  );
const root = resolve(values.get('--root'));
const app = inspectDesktopZoomApp({ desktopApp: values.get('--app') });
const markerFile = join(root, 'qa-owner.json');
const stateFile = join(root, 'owned-instance.json');
const home = join(root, 'home');
const userData = join(root, 'browser');
if (!existsSync(markerFile)) {
  if (action !== 'start' || (existsSync(root) && readdirSync(root).length))
    throw Error('zoom-windows-root-not-owned');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  writeFileSync(
    markerFile,
    JSON.stringify({ version: 1, id: randomUUID(), app: app.executable, source }),
    { mode: 0o600, flag: 'wx' },
  );
}
const marker = JSON.parse(readFileSync(markerFile, 'utf8'));
if (
  marker.version !== 1 ||
  marker.app !== app.executable ||
  marker.source !== source ||
  realpathSync(root) !== root
)
  throw Error('zoom-windows-root-owner-mismatch');
for (const directory of [home, userData]) {
  mkdirSync(directory, { recursive: true });
  if (realpathSync(directory) !== directory) throw Error('zoom-windows-root-link-refused');
}
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const processes = () => desktopZoomWindowsProcesses();
const sameApp = (row) =>
  desktopZoomPath(row.ExecutablePath ?? '') === desktopZoomPath(app.executable);
const owned = (row) =>
  sameApp(row) && String(row.CommandLine).includes(`--user-data-dir=${userData}`);
const host = (row) => {
  const command = desktopZoomPath(row.CommandLine ?? '');
  return (
    command.includes('dsh-desktop-host/') &&
    command.includes(desktopZoomPath(join(home, 'profiles/desktop')))
  );
};
async function connect() {
  const state = JSON.parse(readFileSync(stateFile, 'utf8'));
  if (
    state.owner !== marker.id ||
    !processes().some((row) => row.ProcessId === state.pid && owned(row))
  )
    throw Error('zoom-windows-process-owner-mismatch');
  const [port, endpoint] = readFileSync(join(userData, 'DevToolsActivePort'), 'utf8')
    .trim()
    .split(/\r?\n/);
  if (!/^\d+$/.test(port) || !endpoint.startsWith('/devtools/browser/'))
    throw Error('zoom-windows-debug-endpoint-invalid');
  const listeners = desktopZoomWindowsListener(Number(port));
  if (
    !listeners.length ||
    listeners.some(
      (row) => row.OwningProcess !== state.pid || !['127.0.0.1', '::1'].includes(row.LocalAddress),
    )
  )
    throw Error('zoom-windows-debug-owner-mismatch');
  return connectZoomCdp(`ws://127.0.0.1:${port}${endpoint}`);
}
if (action === 'start') {
  if (processes().some((row) => owned(row) || host(row)))
    throw Error('zoom-windows-already-running');
  const activePort = join(userData, 'DevToolsActivePort');
  if (existsSync(activePort)) unlinkSync(activePort);
  const log = openSync(join(root, 'private.log'), 'a', 0o600);
  let child;
  try {
    child = spawn(
      app.executable,
      [
        `--user-data-dir=${userData}`,
        '--remote-debugging-port=0',
        '--remote-debugging-address=127.0.0.1',
      ],
      {
        env: { ...process.env, ...devSecretEnvironment(), DSH_HOME: home },
        detached: true,
        windowsHide: false,
        stdio: ['ignore', log, log],
      },
    );
    await new Promise((done, reject) => {
      child.once('spawn', done);
      child.once('error', reject);
    });
    child.unref();
  } finally {
    closeSync(log);
  }
  writeFileSync(
    stateFile,
    JSON.stringify({ owner: marker.id, pid: child.pid, started: new Date().toISOString() }),
    { mode: 0o600 },
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    let browser;
    try {
      browser = await connect();
      const { targetInfos } = await browser.send('Target.getTargets');
      ready = targetInfos.some((page) => page.url.startsWith('dsh-app://'));
      if (ready) break;
    } catch {
    } finally {
      browser?.close();
    }
    await pause(500);
  }
  if (!ready) throw Error('zoom-windows-start-outcome-unconfirmed-inspect-private-log');
  console.log(JSON.stringify({ action, pid: child.pid, ready, desktopVersion: app.version, root }));
} else if (action === 'stop') {
  const rows = processes();
  const targets = rows.filter(owned);
  if (targets.length > 1) throw Error('zoom-windows-ambiguous-process');
  if (targets.length) {
    const browser = await connect();
    try {
      await browser.send('Browser.close');
    } catch {
    } finally {
      browser.close();
    }
    for (
      let attempt = 0;
      attempt < 60 && processes().some((row) => owned(row) || host(row));
      attempt++
    )
      await pause(250);
  }
  if (processes().some((row) => owned(row) || host(row)))
    throw Error('zoom-windows-stop-outcome-unconfirmed');
  console.log(JSON.stringify({ action, stopped: true, root }));
} else if (action === 'status') {
  const rows = processes();
  let browser;
  try {
    browser = await connect();
    const { targetInfos } = await browser.send('Target.getTargets');
    const page = targetInfos.find((page) => page.url.startsWith('dsh-app://app/'));
    let client = null;
    if (page) {
      const { sessionId } = await browser.send('Target.attachToTarget', {
        targetId: page.targetId,
        flatten: true,
      });
      try {
        const response = await browser.send(
          'Runtime.evaluate',
          {
            expression: `JSON.stringify({shellPlatform:document.documentElement.dataset.platform,release:window.__DSH_BOOT__?.release?.version,compat:window.__botharnessWindowZoomCompatibility?.platform??null,zoom:document.documentElement.style.zoom,dpi:devicePixelRatio})`,
            returnByValue: true,
          },
          sessionId,
        );
        client = JSON.parse(response.result.value);
      } catch {
        client = { observation: 'renderer-unavailable' };
      }
    }
    console.log(JSON.stringify({ action, running: rows.some(owned), client, root }));
  } finally {
    browser?.close();
  }
} else {
  if (processes().some((row) => sameApp(row) || host(row)))
    throw Error('zoom-windows-desktop-running');
  const profile = join(home, 'profiles/desktop');
  if (action === 'prepare') {
    if (!values.has('--artifacts')) throw Error('zoom-windows-immutable-artifacts-required');
    const artifacts = verifiedProductArtifacts(values.get('--artifacts'));
    const manifestPath = join(profile, 'package.json');
    const manifest = packagedProfileManifest(
      JSON.parse(readFileSync(manifestPath, 'utf8')),
      artifacts.directory,
    );
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const workspace = join(profile, 'pnpm-workspace.yaml');
    writeFileSync(
      workspace,
      packagedWorkspaceSettings(readFileSync(workspace, 'utf8'), artifacts.directory),
    );
    execFileSync(process.execPath, [app.pnpm, 'install', '--config.ignore-scripts=true'], {
      cwd: profile,
      env: { ...process.env, DSH_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000,
    });
    verifyPackagedProfile(profile, artifacts.directory);
    prepareDesktopZoomQa(root);
    console.log(
      JSON.stringify({
        action,
        productVersion: artifacts.productVersion,
        runtimeVerified: false,
        root,
      }),
    );
  } else
    console.log(
      JSON.stringify(
        configureDesktopZoom({ action, home, profile: 'desktop', desktopApp: app.executable }),
      ),
    );
}
