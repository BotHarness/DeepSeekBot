import {
  creationActions,
  targetsFor,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { cloudAvailable } from '../../cloud/available';
import { creationLabel } from './creation-menu';
import type { CreationMenuButtonProps } from './creation-menu-button';

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
}: Pick<CreationMenuButtonProps, 'scope' | 'targets'>): CreationMenuItem[] {
  return creationActions(scope, targets)
    .filter((action) => cloudAvailable || action !== 'join')
    .map((action) => {
      const choices = targetsFor(action, scope, targets);
      const item: CreationMenuItem = { key: action, label: creationLabel(action), action };
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
