export interface AppBuild {
  version: string | undefined;
  buildNumber: string | undefined;
  commit: string | undefined;
  time: string | undefined;
  branch: string | undefined;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function builtAt(time: string | undefined): string | undefined {
  const at = time === undefined ? undefined : new Date(time);
  if (at === undefined || Number.isNaN(at.getTime())) return undefined;
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function appBuildLabel(build: AppBuild): string {
  const version =
    build.version === undefined
      ? undefined
      : build.buildNumber === undefined
        ? build.version
        : `${build.version} (${build.buildNumber})`;
  return [version, build.commit, builtAt(build.time), build.branch]
    .filter((part) => part !== undefined && part !== '')
    .join(' · ');
}
