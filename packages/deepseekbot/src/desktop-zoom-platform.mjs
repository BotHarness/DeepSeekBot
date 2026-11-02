import { execFileSync } from 'node:child_process';
import { lstatSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';

function refuse(code) {
  throw Object.assign(Error(code), { code });
}

export function desktopZoomPowerShell(script, run = execFileSync, options = {}) {
  return run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(
        "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; " +
          script,
        'utf16le',
      ).toString('base64'),
    ],
    {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    },
  );
}

export function desktopZoomWindowsProcesses(run = execFileSync) {
  const output = desktopZoomPowerShell(
    'ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | ' +
      'Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine)',
    run,
  );
  const rows = JSON.parse(String(output).replace(/^\uFEFF/, ''));
  if (!Array.isArray(rows)) refuse('desktop-zoom-setup-process-query-invalid');
  return rows;
}

export function desktopZoomWindowsListener(port, run = execFileSync) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw Error('zoom-windows-debug-port-invalid');
  return JSON.parse(
    String(
      desktopZoomPowerShell(
        `ConvertTo-Json -Compress -InputObject @(Get-NetTCPConnection -LocalPort ${port} -State Listen | Select-Object LocalAddress,OwningProcess)`,
        run,
      ),
    ).replace(/^\uFEFF/, ''),
  );
}

export function inspectDesktopZoomApp({
  desktopApp,
  platform = process.platform,
  run = execFileSync,
  options = {},
}) {
  const app = realpathSync(desktopApp);
  let pnpm;
  let version;
  let executable;
  if (platform === 'darwin') {
    pnpm = join(app, 'Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs');
    version = String(
      run(
        '/usr/libexec/PlistBuddy',
        ['-c', 'Print :CFBundleShortVersionString', join(app, 'Contents/Info.plist')],
        options,
      ),
    ).trim();
  } else if (platform === 'win32') {
    executable = lstatSync(app).isDirectory()
      ? realpathSync(join(app, 'DeepSeek Harness.exe'))
      : app;
    pnpm = join(
      dirname(executable),
      'resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs',
    );
    const literal = executable.replaceAll("'", "''");
    version = String(
      desktopZoomPowerShell(
        `(Get-Item -LiteralPath '${literal}').VersionInfo.FileVersion`,
        run,
        options,
      ),
    ).trim();
  } else refuse('desktop-zoom-setup-platform-unsupported');
  if (!lstatSync(pnpm).isFile()) refuse('desktop-zoom-setup-package-manager-unavailable');
  return { app, executable, pnpm, version };
}

export function desktopZoomPath(value) {
  return String(value)
    .replaceAll('\\', '/')
    .replace(/^\/\/\?\//, '')
    .toLowerCase();
}
