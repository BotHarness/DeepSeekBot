export interface AppBuild {
  version: string | undefined;
  buildNumber: string | undefined;
  commit: string | undefined;
  branch: string | undefined;
}

export function appBuildLabel(build: AppBuild): string {
  const version =
    build.version === undefined
      ? undefined
      : build.buildNumber === undefined
        ? build.version
        : `${build.version} (${build.buildNumber})`;
  return [version, build.commit, build.branch]
    .filter((part) => part !== undefined && part !== '')
    .join(' · ');
}
