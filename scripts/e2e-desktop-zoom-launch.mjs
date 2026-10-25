import { spawn, execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { prepareDesktopZoomQa } from './desktop-zoom-qa.mjs';
import { developmentProfileManifest } from './dev-profile.mjs';
import { configureDesktopZoom } from '../packages/deepseekbot/src/desktop-zoom-setup.mjs';
const source = process.cwd();
const { devSecretEnvironment } = await import(
  pathToFileURL(join(source, 'scripts/dev-secret.mjs'))
);
const store = join(source, 'node_modules/.pnpm'),
  puppeteer = createRequire(
    join(
      store,
      readdirSync(store).find((x) => x.startsWith('puppeteer@')),
      'node_modules/',
    ),
  )('puppeteer');
const resume = process.env.ZOOM_RESUME_ROOT;
const root = resume ?? mkdtempSync(join(tmpdir(), 'bh-2268-zoom-')),
  port = Number(process.env.ZOOM_DEBUG_PORT ?? 39455);
const app = '/Applications/DeepSeek Harness.app';
const desktopVersion = execFileSync(
  '/usr/libexec/PlistBuddy',
  ['-c', 'Print :CFBundleShortVersionString', join(app, 'Contents/Info.plist')],
  { encoding: 'utf8' },
).trim();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let interrupted = false;
for (const sig of ['SIGINT', 'SIGTERM'])
  process.once(sig, () => {
    interrupted = true;
  });
function ownedPid() {
  let pid;
  try {
    pid = Number(
      execFileSync('lsof', ['-t', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim(),
    );
  } catch {
    return null;
  }
  if (!Number.isInteger(pid) || pid <= 0) throw Error('Ambiguous debug listener');
  let cmd;
  try {
    cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  } catch (error) {
    if (error.status === 1) return null;
    throw error;
  }
  if (!cmd.includes(`--user-data-dir=${root}/browser`))
    throw Error('Debug port belongs to another task');
  return pid;
}
async function stop() {
  const pid = ownedPid();
  if (!pid) return;
  process.kill(pid, 'SIGTERM');
  for (let n = 0; n < 100; n++) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await pause(100);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
  for (let n = 0; n < 30 && ownedPid() !== null; n++) await pause(100);
}
async function launch() {
  const child = spawn(
    'open',
    [
      '-n',
      '-a',
      app,
      '--env',
      `DSH_HOME=${root}/home`,
      '--stdout',
      join(root, 'private.log'),
      '--stderr',
      join(root, 'private.log'),
      '--args',
      `--user-data-dir=${root}/browser`,
      `--remote-debugging-port=${port}`,
    ],
    { env: { ...process.env, ...devSecretEnvironment() }, stdio: 'ignore' },
  );
  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve() : reject(Error('LaunchServices failed'))));
  });
}
async function ready(probe = false) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline && !interrupted) {
    let b;
    try {
      const info = await (
        await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(500) })
      ).json();
      b = await puppeteer.connect({
        browserWSEndpoint: info.webSocketDebuggerUrl,
        defaultViewport: null,
        protocolTimeout: 3000,
      });
      const p = (await b.pages()).find((x) => x.url().startsWith('dsh-app://app/'));
      if (p) {
        p.on('pageerror', (e) => writeFileSync(join(root, 'client-error.txt'), e.message));
        try {
          writeFileSync(
            join(root, 'client-state.json'),
            JSON.stringify(
              await p.evaluate(() => ({
                title: document.title,
                body: document.body.innerText.slice(0, 5000),
                zoom: document.documentElement.style.zoom,
                compat: !!window.__botharnessWindowZoomCompatibility,
                platform: document.documentElement.dataset.platform,
              })),
              null,
              2,
            ),
          );
        } catch {}
      }
      if (
        p &&
        (await p.evaluate(
          (probe) =>
            Boolean(window.dshDesktop) &&
            (!probe ||
              (window.__botharnessWindowZoomCompatibility &&
                document.documentElement.style.zoom !== '')) &&
            !document.body.innerText.includes('Loading plugins'),
          probe,
        ))
      ) {
        if (probe)
          await p.evaluate(() => {
            const prefix = 'ZOOM S1 #2268 · ';
            const title = () => {
              if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
            };
            title();
            new MutationObserver(title).observe(document.querySelector('title'), {
              childList: true,
            });
          });
        return;
      }
    } catch {
    } finally {
      b?.disconnect();
    }
    await pause(200);
  }
  throw Error('Owned desktop did not finish boot; inspect its private log.');
}
try {
  if (ownedPid() !== null) throw Error('Debug port occupied');
  if (!resume) {
    await launch();
    await ready();
    await stop();
    const profile = join(root, 'home/profiles/desktop'),
      manifest = join(profile, 'package.json');
    const data = developmentProfileManifest(JSON.parse(readFileSync(manifest)), source);
    for (const [name, spec] of Object.entries(data.dependencies)) {
      if (!spec.startsWith('link:')) continue;
      const link = join(profile, 'node_modules', name);
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(spec.slice(5), link);
    }
    writeFileSync(manifest, JSON.stringify(data, null, 2));
  }
  prepareDesktopZoomQa(root);
  configureDesktopZoom({
    action: 'enable',
    home: join(root, 'home'),
    profile: 'desktop',
    dsh: join(source, 'node_modules/.bin/dsh'),
    desktopApp: app,
  });
  await launch();
  await ready(true);
  const cliAccessFile = join(root, 'cli-access.json');
  const metadataDeadline = Date.now() + 20000;
  while (Date.now() < metadataDeadline) {
    try {
      if (JSON.parse(readFileSync(cliAccessFile, 'utf8')).desktopPid === ownedPid()) break;
    } catch {}
    await pause(100);
  }
  const cliAccess = JSON.parse(readFileSync(cliAccessFile, 'utf8'));
  if (cliAccess.desktopPid !== ownedPid()) throw Error('Stale desktop CLI access metadata');
  writeFileSync(
    join(root, 'owned-instance.json'),
    JSON.stringify({
      desktopVersion,
      pid: ownedPid(),
      debugPort: port,
      cliAccessFile,
    }),
    { mode: 0o600 },
  );
  console.log('Isolated S1 desktop ready; private metadata: ' + join(root, 'owned-instance.json'));
  writeFileSync('/tmp/zoom2268-instance-path', root, { mode: 0o600 });
  while (!interrupted && ownedPid() !== null) await pause(1000);
} finally {
  await stop();
  console.log('Owned S1 desktop stopped; private temporary Profile retained at ' + root);
}
