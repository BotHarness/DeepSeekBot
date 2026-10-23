import {
  creationActions,
  targetsFor,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { cloudAvailable } from '../../cloud/available';
import { creationLabel } from './creation-menu';
import type { CreationMenuButtonProps } from './creation-menu-button';
import { t } from '../strings';

export type CreationMenuItem = {
  key: string;
  label: string;
  action: CreationAction;
  target?: CreationTarget;
  children?: CreationMenuItem[];
};

export function creationMenuItems({
  scope,
  targets,
  nativeChannelForm = false,
}: Pick<CreationMenuButtonProps, 'scope' | 'targets'> & {
  nativeChannelForm?: boolean;
}): CreationMenuItem[] {
  const actions = creationActions(scope, targets);
  if (nativeChannelForm && scope === 'all' && !actions.includes('channel'))
    actions.splice(4, 0, 'channel');
  return actions
    .filter((action) => cloudAvailable || action !== 'join')
    .map((action) => {
      const choices = targetsFor(action, scope, targets);
      const item: CreationMenuItem = { key: action, label: creationLabel(action), action };
      if (nativeChannelForm && scope === 'all' && action === 'channel') {
        const cloudChoices = cloudAvailable
          ? choices.filter((target) => target.kind === 'cloud')
          : [];
        if (cloudChoices.length)
          item.children = [
            { key: 'channel-computer', label: t.computers, action },
            ...cloudChoices.map((target) => ({
              key: `${action}-${target.key}`,
              label: target.name,
              action,
              target,
            })),
          ];
        return item;
      }
      if (scope === 'all' && (action === 'channel' || action === 'invite')) {
        item.children = choices.map((target) => ({
          key: `${action}-${target.key}`,
          label: target.name,
          action,
          target,
        }));
      } else if (scope !== 'all' && choices[0]) item.target = choices[0];
      return item;
    });
}
