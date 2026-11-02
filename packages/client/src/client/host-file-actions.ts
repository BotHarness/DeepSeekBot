import type { SessionRemote } from '@deepseek-ai/dsh-api-session-controller/client';

export interface HostFileTarget {
  path: string;
  relativePath: string;
  kind: 'file' | 'directory';
}
export interface HostFileApplication {
  id: string;
  name: string;
  default: boolean;
  icon: string | null;
}
export interface HostFileOptions {
  available: boolean;
  applications: readonly HostFileApplication[];
  error?: string;
}
export type HostFileOpen = { application: string } | { action: 'reveal' };
export interface NativeHostFiles {
  available?(): Promise<boolean>;
  applications(target: HostFileTarget): Promise<HostFileOptions>;
  open(target: HostFileTarget, choice: HostFileOpen): Promise<void>;
}
const directoryNames: Readonly<Record<string, string>> = {
  finder: 'Finder',
  explorer: 'File Explorer',
  filemanager: 'File manager',
  cursor: 'Cursor',
  vscode: 'Visual Studio Code',
  vscodeinsiders: 'Visual Studio Code Insiders',
  windsurf: 'Windsurf',
  zed: 'Zed',
  sublimetext: 'Sublime Text',
  xcode: 'Xcode',
  androidstudio: 'Android Studio',
  intellij: 'IntelliJ IDEA',
  pycharm: 'PyCharm',
  webstorm: 'WebStorm',
  phpstorm: 'PhpStorm',
  goland: 'GoLand',
  rider: 'Rider',
  rustrover: 'RustRover',
  fork: 'Fork',
  sourcetree: 'Sourcetree',
  github: 'GitHub Desktop',
  tower: 'Tower',
  gitkraken: 'GitKraken',
  smartgit: 'SmartGit',
  sublimemerge: 'Sublime Merge',
  ghostty: 'Ghostty',
  warp: 'Warp',
  iterm: 'iTerm',
  kitty: 'Kitty',
  terminal: 'Terminal',
  windowsterminal: 'Windows Terminal',
  gitbash: 'Git Bash',
  gnometerminal: 'GNOME Terminal',
  konsole: 'Konsole',
};

export function createNativeHostFiles(
  session: Pick<
    SessionRemote,
    'canOpenWorkspacePath' | 'workspacePathApplications' | 'openWorkspacePath'
  >,
  fetcher: typeof fetch = fetch,
): NativeHostFiles {
  const route = (path: string): string => new URL(path, document.baseURI).href;
  return {
    async available() {
      const capability = await session.canOpenWorkspacePath();
      return capability.ok && capability.value;
    },
    async applications(target) {
      if (target.kind === 'directory') {
        const response = await fetcher(route('./open-in-app/apps'), {
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) return { available: false, applications: [] };
        const payload = (await response.json()) as { apps?: unknown };
        const ids = Array.isArray(payload.apps) ? payload.apps : [];
        const applications = ids
          .filter((id): id is string => typeof id === 'string' && directoryNames[id] !== undefined)
          .map((id) => ({
            id,
            name: directoryNames[id]!,
            default: false,
            icon: route(`./open-in-app/icon/${encodeURIComponent(id)}`),
          }));
        return { available: applications.length > 0, applications };
      }
      const capability = await session.canOpenWorkspacePath();
      if (!capability.ok || !capability.value) return { available: false, applications: [] };
      const handlers = await session.workspacePathApplications(
        { path: target.path },
        AbortSignal.timeout(15_000),
      );
      return handlers.ok
        ? { available: true, applications: handlers.value }
        : {
            available: true,
            applications: [],
            error: handlers.error.message,
          };
    },
    async open(target, choice) {
      if (target.kind === 'directory') {
        if (!('application' in choice))
          throw new Error('Directories require an installed application');
        const response = await fetcher(route('./open-in-app/open'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ app: choice.application, path: target.path }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error('DSH could not open this directory on the Host');
        return;
      }
      const result = await session.openWorkspacePath(
        { path: target.path, ...choice },
        AbortSignal.timeout(15_000),
      );
      if (!result.ok) throw new Error(result.error.message);
    },
  };
}

export function memoryDownloadUrl(slug: string, path: string): string {
  const url = new URL('./api/botharness/memory/file', document.baseURI);
  url.search = new URLSearchParams({ slug, path }).toString();
  return url.href;
}
