import {
  creationActions,
  targetsFor,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { cloudAvailable } from '../../cloud/available';
import { t } from '../strings';

export type CreationMenuItem = {
  key: string;
  label: string;
  target?: CreationTarget;
} & (
  | { action: CreationAction; children?: CreationMenuItem[] }
  | { action: 'create-bot'; children: CreationMenuItem[] }
);

export function creationMenuGroups({
  scope,
  targets,
}: {
  scope: string;
  targets: readonly CreationTarget[];
}): CreationMenuItem[][] {
  const actions = creationActions(scope, targets);
  const groupItem = (): CreationMenuItem => {
    const action = 'channel';
    const label = t.chatsCreate.group;
    const available = targetsFor(action, scope, targets);
    if (scope !== 'all') {
      const target = available[0];
      return { key: action, label, action, ...(target ? { target } : {}) };
    }
    const cloud = cloudAvailable ? available.filter((target) => target.kind === 'cloud') : [];
    return {
      key: action,
      label,
      action,
      ...(cloud.length && {
        children: [
          { key: 'channel-computer', label: t.computers, action },
          ...cloud.map((target): CreationMenuItem => ({
            key: `${action}-${target.key}`,
            label: target.name,
            action,
            target,
          })),
        ],
      }),
    };
  };
  const botItems = (
    [
      ['bot', t.chatsCreate.blank],
      ['marketplace', t.chatsCreate.marketplace],
      ['zip', t.chatsCreate.zip],
      ['git', t.chatsCreate.git],
    ] as const
  ).flatMap(([action, label]): CreationMenuItem[] => {
    if (!actions.includes(action)) return [];
    const target = scope === 'all' ? undefined : targetsFor(action, scope, targets)[0];
    return [{ key: action, label, action, ...(target ? { target } : {}) }];
  });
  const primary: CreationMenuItem[] = [];
  if (scope === 'all' || actions.includes('channel')) primary.push(groupItem());
  if (cloudAvailable && actions.includes('join'))
    primary.push({ key: 'join', label: t.chatsCreate.join, action: 'join' });
  const groups: CreationMenuItem[][] = [primary];
  if (botItems.length) {
    groups.push([
      { key: 'create-bot', label: t.botCreation.title, action: 'create-bot', children: botItems },
    ]);
  }
  if (cloudAvailable && actions.includes('invite')) {
    const target = targetsFor('invite', scope, targets)[0];
    if (target) groups.push([{ key: 'invite', label: t.invitePeople, action: 'invite', target }]);
  }
  return groups.filter((group) => group.length > 0);
}
