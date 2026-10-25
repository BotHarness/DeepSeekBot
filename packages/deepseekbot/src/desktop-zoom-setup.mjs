import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  desktopZoomPath,
  desktopZoomWindowsProcesses,
  inspectDesktopZoomApp,
} from './desktop-zoom-platform.mjs';

const theme = '@deepseek-ai/dsh-client-ui-theme';
function refuse(code) {
  throw Object.assign(Error(code), { code });
}
function profileDirectory(home, profile) {
  if (!home || !profile || !/^[A-Za-z0-9_-]+$/.test(profile))
    refuse('desktop-zoom-setup-explicit-profile-required');
  const directory = join(realpathSync(home), 'profiles', profile);
  if (realpathSync(directory) !== directory) refuse('desktop-zoom-setup-profile-link-refused');
  return directory;
}
export function configureDesktopZoom(options) {
  if (options.profile?.toLowerCase() !== 'desktop' || !options.home)
    return configureProfileZoom(options);
  const lock = join(profileDirectory(options.home, options.profile), 'package.json.lock');
  let file;
  try {
    file = openSync(lock, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') refuse('desktop-zoom-setup-profile-busy');
    throw error;
  }
  try {
    writeFileSync(file, `${process.pid}\n`);
    return configureProfileZoom(options);
  } finally {
    try {
      const own = fstatSync(file, { bigint: true });
      let current;
      try {
        current = lstatSync(lock, { bigint: true });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (current?.ino === own.ino && current?.dev === own.dev) unlinkSync(lock);
    } finally {
      closeSync(file);
    }
  }
}
function configureProfileZoom({
  action,
  home,
  profile,
  dsh = 'dsh',
  desktopApp,
  platform = process.platform,
  run = (executable, args, options) => execFileSync(executable, args, options),
  processes = () => execFileSync('/bin/ps', ['-axo', 'command='], { encoding: 'utf8' }),
  windowsProcesses = () => desktopZoomWindowsProcesses(),
}) {
  if (!['enable', 'disable'].includes(action)) refuse('desktop-zoom-setup-action-required');
  const directory = profileDirectory(home, profile);
  const manifestPath = join(directory, 'package.json');
  const before = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const bundles = before.dsh?.profile?.bundles ?? [];
  const entry =
    !bundles.includes('deepseekbot') && bundles.includes('tobs') ? 'tobs' : 'deepseekbot';
  const product = join(directory, 'node_modules', entry);
  const target = join(product, 'desktop-theme');
  const ownedLink = `link:${relative(directory, target).replaceAll('\\', '/')}`;
  const current = before.dependencies?.[theme];
  if (current !== undefined && current !== ownedLink) refuse('desktop-zoom-setup-theme-conflict');
  const alias = join(directory, 'node_modules', theme);
  const linkState = () => {
    let stat;
    try {
      stat = lstatSync(alias);
    } catch (error) {
      if (error.code === 'ENOENT') return 'absent';
      throw error;
    }
    if (!stat.isSymbolicLink()) return 'foreign';
    try {
      return realpathSync(alias) === realpathSync(target) ? 'owned' : 'foreign';
    } catch (error) {
      if (error.code === 'ENOENT') return 'foreign';
      throw error;
    }
  };
  if (linkState() === 'foreign') refuse('desktop-zoom-setup-theme-conflict');
  const options = {
    cwd: directory,
    env: { ...process.env, DSH_HOME: realpathSync(home) },
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  let packageCommand;
  let desktopExecutable;
  const checkStopped = () => {
    if (platform === 'win32') {
      const rows = windowsProcesses();
      const path = desktopZoomPath(directory);
      if (
        rows.some((row) => {
          const command = desktopZoomPath(row.CommandLine ?? '');
          return (
            (desktopExecutable &&
              desktopZoomPath(row.ExecutablePath ?? '') === desktopZoomPath(desktopExecutable)) ||
            (command.includes('dsh-desktop-host/') && command.includes(path))
          );
        })
      )
        refuse('desktop-zoom-setup-desktop-running');
      return;
    }
    const paths = new Set([directory, join(resolve(home), 'profiles', profile)]);
    if (directory.startsWith('/private/var/')) paths.add(directory.slice('/private'.length));
    const running = processes()
      .split('\n')
      .some(
        (line) =>
          line.includes('dsh-desktop-host/') && [...paths].some((path) => line.includes(path)),
      );
    if (running) refuse('desktop-zoom-setup-desktop-running');
  };
  if (profile.toLowerCase() === 'desktop') {
    if (!['darwin', 'win32'].includes(platform)) refuse('desktop-zoom-setup-platform-unsupported');
    if (!desktopApp) refuse('desktop-zoom-setup-desktop-app-required');
    const runtime = inspectDesktopZoomApp({ desktopApp, platform, run, options });
    desktopExecutable = runtime.executable;
    checkStopped();
    packageCommand = { executable: process.execPath, args: [runtime.pnpm] };
  }
  if (action === 'enable') {
    if (platform !== 'darwin' && !(platform === 'win32' && packageCommand))
      refuse('desktop-zoom-setup-platform-unsupported');
    const manifest = JSON.parse(readFileSync(join(product, 'package.json'), 'utf8'));
    if (manifest.name !== entry || !bundles.some((name) => ['deepseekbot', 'tobs'].includes(name)))
      refuse('desktop-zoom-setup-product-not-enabled');
    const root = join(product, 'desktop-theme');
    const provenance = JSON.parse(readFileSync(join(root, 'botharness-zoom-compat.json'), 'utf8'));
    const client = readFileSync(join(root, 'lib/client.js'));
    if (
      provenance.adapterVersion !== 1 ||
      (platform === 'win32' && !provenance.platforms?.includes('windows')) ||
      createHash('sha256').update(client).digest('hex') !== provenance.clientAfter
    )
      refuse('desktop-zoom-setup-theme-unqualified');
    const patch = readFileSync(join(product, manifest.dsh.bundle.patch), 'utf8');
    if (patch.includes('botharness-desktop-theme'))
      refuse('desktop-zoom-setup-product-upgrade-required');
  }
  const packageChanged = action === 'enable' ? current !== ownedLink : current === ownedLink;
  const changed = packageChanged || (action === 'disable' && linkState() === 'owned');
  if (packageChanged) {
    if (packageCommand) checkStopped();
    try {
      run(
        packageCommand?.executable ?? dsh,
        [
          ...(packageCommand?.args ?? ['plugin', '--profile', profile]),
          action === 'enable' ? 'add' : 'remove',
          action === 'enable' ? `${theme}@${ownedLink}` : theme,
          ...(packageCommand ? ['--config.ignore-scripts=true'] : []),
        ],
        options,
      );
    } catch {
      refuse('desktop-zoom-setup-package-outcome-unconfirmed');
    }
  }
  if (packageCommand) checkStopped();
  if (action === 'disable' && linkState() === 'owned') unlinkSync(alias);
  const after = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    action === 'enable'
      ? after.dependencies?.[theme] !== ownedLink
      : after.dependencies?.[theme] !== undefined
  )
    refuse('desktop-zoom-setup-package-outcome-unconfirmed');
  if (action === 'enable' ? linkState() !== 'owned' : linkState() !== 'absent')
    refuse('desktop-zoom-setup-package-outcome-unconfirmed');
  return { action, profile, changed, restartRequired: true, runtimeVerified: false };
}
export function runDesktopZoomSetup(args) {
  const [action, ...flags] = args;
  const values = new Map();
  for (let i = 0; i < flags.length; i += 2) {
    if (
      !['--home', '--profile', '--dsh', '--desktop-app'].includes(flags[i]) ||
      !flags[i + 1] ||
      values.has(flags[i])
    )
      refuse('desktop-zoom-setup-arguments-invalid');
    values.set(flags[i], flags[i + 1]);
  }
  return configureDesktopZoom({
    action,
    home: values.get('--home'),
    profile: values.get('--profile'),
    dsh: values.get('--dsh'),
    desktopApp: values.get('--desktop-app'),
  });
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(runDesktopZoomSetup(process.argv.slice(2))));
  } catch (error) {
    console.error(JSON.stringify({ code: error.code ?? 'desktop-zoom-setup-failed' }));
    process.exitCode = 1;
  }
}
