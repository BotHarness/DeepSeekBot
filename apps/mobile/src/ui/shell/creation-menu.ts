import { useState } from 'react';
import {
  creationActions,
  targetsFor,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { cloudAvailable } from '../../cloud/available';
import { t } from '../strings';

export const creationLabel = (action: CreationAction) =>
  ({
    channel: t.newChannel,
    bot: t.newPersonaBot,
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
  const actions = creationActions(scope, targets).filter((a) => cloudAvailable || a !== 'join');
  const choices = choosing ? targetsFor(choosing, scope, targets) : [];
  const pick = (action: CreationAction) => {
    if (action === 'join') return onPick(action);
    if (scope === 'all') return setChoosing(action);
    const target = targetsFor(action, scope, targets)[0];
    if (target) onPick(action, target);
  };
  return { choosing, setChoosing, actions, choices, pick };
}
