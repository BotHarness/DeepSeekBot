import type { HostIcon } from '@botharness/host-client/ui/design/host-look';

export type SessionPlace = { hostIcon: HostIcon; hostName: string; folder?: string; path?: string };

export function folderName(cwd: string): string {
  const trimmed = cwd.replace(/[\\/]+$/u, '');
  return trimmed.split(/[\\/]/u).findLast((part) => part !== '') ?? cwd;
}

export function sessionPlace({
  hostIcon,
  hostName,
  cwd,
}: {
  hostIcon: HostIcon;
  hostName: string;
  cwd: string | undefined;
}): SessionPlace {
  return cwd === undefined || cwd === ''
    ? { hostIcon, hostName }
    : { hostIcon, hostName, folder: folderName(cwd), path: cwd };
}

export function sessionPlaceLabel(title: string, place: SessionPlace | undefined): string {
  return [title, place?.hostName, place?.folder].filter(Boolean).join(', ');
}

export function sessionMenuHeader(title: string, place: SessionPlace | undefined): string {
  return [title, place?.hostName, place?.path].filter(Boolean).join('\n');
}
