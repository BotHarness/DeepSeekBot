import { cloudAvailable } from '../../cloud/available';
import { creationActions, targetsFor, type CreationTarget } from '../../host/creation-targets';

export function chatsCreationActions(scope: string, targets: readonly CreationTarget[]) {
  const actions = creationActions(scope, targets);
  return {
    group: scope === 'all' || actions.includes('channel'),
    bot: actions.includes('bot'),
    join: cloudAvailable && actions.includes('join'),
    invite:
      cloudAvailable && actions.includes('invite')
        ? targetsFor('invite', scope, targets)[0]
        : undefined,
  };
}

export const botSourcePaths = {
  blank: '/create-bot',
  marketplace: '/marketplace',
  zip: '/import-bot-zip',
  git: '/import-bot-git',
} as const;

export type BotSource = keyof typeof botSourcePaths;

export function botSourceHref(source: BotSource, hostId?: string) {
  return {
    pathname: botSourcePaths[source],
    params: hostId ? { entry: 'host', hostId } : { entry: 'all' },
  };
}
