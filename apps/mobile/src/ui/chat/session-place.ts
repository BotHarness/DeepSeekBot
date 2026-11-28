import {
  hostColorInk,
  type HostColorId,
  type HostIcon,
} from '@botharness/host-client/ui/design/host-look';
import {
  SESSION_HOST_COLOR,
  sessionFolderColor,
} from '../../features/sessions/session-query-model';
import type { DesignTheme } from '../design/theme';

export type SessionPlace = {
  hostIcon: HostIcon;
  hostName: string;
  hostColor?: HostColorId;
  folder?: string;
  folderColor?: HostColorId;
  path?: string;
};

export function folderName(cwd: string): string {
  const trimmed = cwd.replace(/[\\/]+$/u, '');
  return trimmed.split(/[\\/]/u).findLast((part) => part !== '') ?? cwd;
}

export function sessionPlace({
  hostIcon,
  hostName,
  hostColor = SESSION_HOST_COLOR,
  cwd,
  customFolderColor,
  autoFolderColor,
}: {
  hostIcon: HostIcon;
  hostName: string;
  hostColor?: HostColorId | undefined;
  cwd: string | undefined;
  customFolderColor?: string | undefined;
  autoFolderColor?: HostColorId | undefined;
}): SessionPlace {
  if (!cwd) return { hostIcon, hostName, hostColor };
  const folder = folderName(cwd);
  return {
    hostIcon,
    hostName,
    hostColor,
    folder,
    folderColor: sessionFolderColor(folder, customFolderColor, autoFolderColor),
    path: cwd,
  };
}

export function sessionPlaceInk(theme: DesignTheme, place: SessionPlace) {
  return {
    host: hostColorInk(theme.scheme, theme.color, place.hostColor ?? SESSION_HOST_COLOR),
    folder: hostColorInk(
      theme.scheme,
      theme.color,
      place.folderColor ?? sessionFolderColor(place.folder, undefined, undefined),
    ),
  };
}

export function sessionPlaceLabel(title: string, place: SessionPlace | undefined): string {
  return [title, place?.hostName, place?.folder].filter(Boolean).join(', ');
}

export function breakablePath(path: string): string {
  return path.replace(/([\\/_-])(?=.)/gu, '$1\u200b');
}

export function sessionMenuHeader(title: string, place: SessionPlace | undefined): string {
  const path = place?.path === undefined ? undefined : breakablePath(place.path);
  return [title, place?.hostName, path].filter(Boolean).join('\n');
}
