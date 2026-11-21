import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
