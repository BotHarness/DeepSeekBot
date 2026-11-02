import { useState } from 'react';
import {
  creationActions,
  targetsFor,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { cloudAvailable } from '../../cloud/available';
import { t } from '../strings';

export const creationLabel = (action: CreationAction | 'import') =>
  ({
    channel: t.newChannel,
    bot: t.botCreation.blank,
    import: t.botCreation.importBot,
    zip: t.botCreation.fromZip,
    marketplace: t.marketplace.browse,
    git: t.botCreation.fromGit,
    invite: t.invitePeople,
    join: t.cloudJoin.title,
  })[action];

export type CreationPanelProps = {
  scope: string;
  targets: CreationTarget[];
  bottom: number;
  size: number;
  onClose(): void;
  onPick(action: CreationAction, target?: CreationTarget): void;
  busy: boolean;
  error?: string | undefined;
};

export function useCreationMenu({
  scope,
  targets,
  onPick,
}: Pick<CreationPanelProps, 'scope' | 'targets' | 'onPick'>) {
  const [choosing, setChoosing] = useState<CreationAction>();
  const [importing, setImporting] = useState(false);
  const available = creationActions(scope, targets).filter((a) => cloudAvailable || a !== 'join');
  const actions = importing
    ? available.filter((action) => action === 'zip' || action === 'git')
    : available.flatMap((action): (CreationAction | 'import')[] =>
        action === 'zip' ? ['import'] : action === 'git' ? [] : [action],
      );
  const choices = choosing ? targetsFor(choosing, scope, targets) : [];
  const pick = (action: CreationAction | 'import') => {
    if (action === 'import') return setImporting(true);
    if (action === 'join') return onPick(action);
    if (['bot', 'zip', 'marketplace', 'git'].includes(action))
      return onPick(action, scope === 'all' ? undefined : targetsFor(action, scope, targets)[0]);
    if (scope === 'all') return setChoosing(action);
    const target = targetsFor(action, scope, targets)[0];
    if (target) onPick(action, target);
  };
  return { choosing, setChoosing, importing, setImporting, actions, choices, pick };
}
