export interface BuildStamp {
  sha: string;
  time?: string;
}

declare const __BOTHARNESS_BUILD__: BuildStamp | undefined;

export function clientBuild(): BuildStamp {
  return typeof __BOTHARNESS_BUILD__ === 'undefined' ? { sha: 'dev' } : __BOTHARNESS_BUILD__;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function buildLabel(stamp: BuildStamp): string {
  const at = stamp.time === undefined ? undefined : new Date(stamp.time);
  if (at === undefined || Number.isNaN(at.getTime())) return stamp.sha;
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  return `${stamp.sha} · ${day} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
