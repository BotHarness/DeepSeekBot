import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type { CdpClient } from './cdp.js';
import {
  diagnoseStartupExit,
  missingLibsOfBinary,
  spawnFailure,
  startupTimeoutFailure,
  type PreflightDeps,
} from './provision.js';

export function browserCandidates(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  if (platform === 'win32') {
    const programFiles = env['ProgramFiles'] ?? 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
    const localAppData = env['LOCALAPPDATA'];
    return [
      join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ...(localAppData === undefined || localAppData === ''
        ? []
        : [join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')]),
      join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

export function discoverBrowserBinary(
  browserPath?: string,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
): string | undefined {
  const explicit = browserPath?.trim() ?? '';
  if (explicit !== '') return fileExists(explicit) ? explicit : undefined;
  return browserCandidates(platform, env).find((candidate) => fileExists(candidate));
}

export const PINNED_CHROMIUM_VERSION = '154.0.8037.57';

export async function installPinnedBrowser(
  cacheDir: string,
  hooks?: { onProgress?: (downloadedBytes: number, totalBytes: number) => void },
): Promise<string> {
  const { Browser, install } = await import('@puppeteer/browsers');
  const installed = await install({
    browser: Browser.CHROME,
    buildId: PINNED_CHROMIUM_VERSION,
    cacheDir,
    ...(hooks?.onProgress === undefined ? {} : { downloadProgressCallback: hooks.onProgress }),
  });
  return installed.executablePath;
}

export function buildLaunchArgs(options: {
  userDataDir: string;
  headless?: boolean;
}): readonly string[] {
  return [
    `--user-data-dir=${options.userDataDir}`,
    '--remote-debugging-port=0',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    ...(options.headless === true ? ['--headless=new'] : []),
    '--new-window',
    'about:blank',
  ];
}

export function parseDevToolsUrl(output: string): string | undefined {
  const match = /ws:\/\/[^\s]+\/devtools\/browser\/[^\s]+/u.exec(output);
  return match?.[0];
}

const CHROMIUM_PROCESS_NOTIFIED = 21;

type BrowserStartup =
  | { kind: 'endpoint'; url: string }
  | { kind: 'windows-handoff'; code: 0 | typeof CHROMIUM_PROCESS_NOTIFIED };

export function waitForBrowserEndpoint(
  proc: ChildProcess,
  options: {
    binary: string;
    platform: NodeJS.Platform;
    timeoutMs: number;
    preflight?: PreflightDeps | undefined;
  },
): Promise<BrowserStartup> {
  const { binary, platform, timeoutMs, preflight } = options;
  return new Promise((resolve, reject) => {
    let stderr = '';
    let stderrTruncated = false;
    const settle = (action: () => void): void => {
      clearTimeout(timer);
      proc.stderr?.off('data', onData);
      proc.off('exit', onExit);
      proc.off('error', onError);
      action();
    };
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(
            startupTimeoutFailure(timeoutMs, {
              binary,
              ...(proc.pid === undefined ? {} : { pid: proc.pid }),
              exitCode: proc.exitCode,
              signalCode: proc.signalCode,
              killed: proc.killed,
              stderr: stderrTruncated
                ? stderr.includes('\n')
                  ? stderr.slice(stderr.indexOf('\n') + 1)
                  : '<truncated line>'
                : stderr,
            }),
          ),
        ),
      timeoutMs,
    );
    const onData = (chunk: Buffer): void => {
      stderr += chunk.toString('utf8');
      const url = parseDevToolsUrl(stderr);
      if (url !== undefined) settle(() => resolve({ kind: 'endpoint', url }));
      if (stderr.length > 8192) {
        stderr = stderr.slice(-8192);
        stderrTruncated = true;
      }
    };
    const onExit = (code: number | null): void =>
      settle(() => {
        if (platform === 'win32' && (code === 0 || code === CHROMIUM_PROCESS_NOTIFIED)) {
          resolve({ kind: 'windows-handoff', code });
          return;
        }
        const missingLibs = platform === 'linux' ? missingLibsOfBinary(binary, preflight) : [];
        reject(diagnoseStartupExit({ binary, code, stderr, platform, missingLibs }));
      });
    const onError = (error: Error): void => settle(() => reject(spawnFailure(error, binary)));
    proc.stderr?.on('data', onData);
    proc.on('exit', onExit);
    proc.on('error', onError);
  });
}

export function hasWindowsBrowserProfileLock(userDataDir: string): boolean {
  return existsSync(join(userDataDir, 'lockfile'));
}

export async function connectWindowsBrowserHandoff(options: {
  userDataDir: string;
  deadline: number;
  connect: (url: string, timeoutMs: number) => Promise<CdpClient>;
}): Promise<CdpClient | undefined> {
  const portFile = join(options.userDataDir, 'DevToolsActivePort');
  while (Date.now() < options.deadline) {
    if (hasWindowsBrowserProfileLock(options.userDataDir)) {
      const record = await readFile(portFile, 'utf8').catch(() => '');
      const match =
        /^(\d{1,5})\r?\n(\/devtools\/browser\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})\s*$/iu.exec(
          record,
        );
      const port = Number(match?.[1]);
      const endpointPath = match?.[2];
      const remaining = options.deadline - Date.now();
      if (port > 0 && port <= 65_535 && endpointPath !== undefined && remaining > 0) {
        const url = `ws://127.0.0.1:${port}${endpointPath}`;
        const client = await options
          .connect(url, Math.min(remaining, 1_000))
          .catch(() => undefined);
        if (client !== undefined) return client;
      }
    }
    const remaining = options.deadline - Date.now();
    if (remaining > 0) await delay(Math.min(100, remaining));
  }
  return undefined;
}

export async function closeWindowsBrowserHandoff(
  userDataDir: string,
  client: CdpClient,
): Promise<void> {
  if (!hasWindowsBrowserProfileLock(userDataDir)) return;
  void client.send('Browser.close').catch(() => undefined);
  const deadline = Date.now() + 15_000;
  while (hasWindowsBrowserProfileLock(userDataDir)) {
    if (Date.now() >= deadline)
      throw new Error('The Bot Browser did not release its profile after shutdown');
    await delay(100);
  }
}
