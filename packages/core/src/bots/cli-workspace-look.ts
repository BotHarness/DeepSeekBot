import { CliLiveError } from './cli-live-error.js';

export interface WorkspaceLookValues {
  cwd?: string;
  clear?: boolean;
  color?: string;
  emoji?: string;
  symbol?: string;
  monogram?: boolean;
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export function workspaceLookRequest(
  command: 'workspace-look' | 'workspace-look-set',
  values: WorkspaceLookValues,
): { method: string; args: Record<string, unknown> } {
  const path = values.cwd?.trim();
  if (!path) usage(`${command} requires --cwd.`);
  if (command === 'workspace-look') return { method: 'workspaceLook', args: { path } };
  const icons = [values.symbol !== undefined, values.emoji !== undefined, values.monogram === true];
  if (icons.filter(Boolean).length > 1)
    usage('workspace-look-set takes at most one of --symbol, --emoji or --monogram.');
  if (values.clear === true) {
    if (values.color !== undefined || icons.some(Boolean))
      usage('workspace-look-set --clear takes no other look flags.');
    return { method: 'workspaceLookSet', args: { path, look: null } };
  }
  const icon =
    values.symbol !== undefined
      ? { kind: 'symbol', id: values.symbol.trim() }
      : values.emoji !== undefined
        ? { kind: 'emoji', emoji: values.emoji.trim() }
        : values.monogram === true
          ? { kind: 'monogram' }
          : undefined;
  if (values.color === undefined && icon === undefined)
    usage('workspace-look-set needs --color, an icon flag, or --clear.');
  return {
    method: 'workspaceLookSet',
    args: {
      path,
      look: {
        ...(values.color === undefined ? {} : { color: values.color.trim() }),
        ...(icon === undefined ? {} : { icon }),
      },
    },
  };
}
