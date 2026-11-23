import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { View, type ViewInstance } from 'react-native';
import { shownHostName } from '@botharness/host-client/ui/design/host-look';
import { cloudError } from '../../cloud/client';
import { cloudClient } from '../../cloud/native';
import { useCloudConversations } from '../../cloud/native-conversations';
import { prepareCloudCreation } from '../../cloud/prepare-creation';
import {
  creationTargets,
  type CreationAction,
  type CreationTarget,
} from '../../host/creation-targets';
import { useHostSession } from '../../host/host-session';
import { useMemberCanCreateBots } from '../../host/member-permissions';
import { useHostLook } from '../../host/native-host-look';
import { useMounted } from '../mounted';
import { showAppDialog } from '../primitives/app-dialog';
import { useStrings } from '../strings';
import { CreationMenuButton } from './creation-menu-button';
import { creationMenuGroups } from './creation-menu-items';

export function ChatsCreate({ scope, size }: { scope: string; size: number }) {
  return <ScopedChatsCreate key={scope} scope={scope} size={size} />;
}

function ScopedChatsCreate({ scope, size }: { scope: string; size: number }) {
  const { saved } = useHostSession();
  const look = useHostLook(saved?.hostId);
  const directory = useCloudConversations();
  const canCreateBots = useMemberCanCreateBots(
    saved?.member === undefined ? undefined : saved.hostId,
  );
  const targets = creationTargets(
    saved ? { hostId: saved.hostId, name: shownHostName(look, saved.hostName) } : undefined,
    directory.workspaces,
  ).map((target) =>
    target.kind === 'computer' ? { ...target, botCreation: canCreateBots } : target,
  );
  const t = useStrings();
  const [busy, setBusy] = useState(false);
  const pendingCreation = useRef(false);
  const generation = useRef(0);
  const mount = useMounted<ViewInstance>(
    () => () => {
      generation.current++;
    },
    [],
  );
  useFocusEffect(
    useCallback(
      () => () => {
        generation.current++;
      },
      [],
    ),
  );
  const choose = async (action: CreationAction, target?: CreationTarget) => {
    if (pendingCreation.current) return;
    const version = generation.current;
    if (action === 'join') {
      router.push('/cloud-join');
      return;
    }
    if (action === 'bot' || action === 'zip' || action === 'marketplace' || action === 'git') {
      router.push({
        pathname:
          action === 'marketplace'
            ? '/marketplace'
            : action === 'zip'
              ? '/import-bot-zip'
              : action === 'git'
                ? '/import-bot-git'
                : '/create-bot',
        params:
          target?.kind === 'computer' ? { entry: 'host', hostId: target.hostId } : { entry: 'all' },
      });
      return;
    }
    if (action === 'channel' && target?.kind !== 'cloud') {
      router.push({
        pathname: '/create-channel',
        params:
          scope === 'all' || !target ? { entry: 'all' } : { entry: 'host', hostId: target.hostId },
      });
      return;
    }
    if (!target) return;
    pendingCreation.current = true;
    setBusy(true);
    try {
      if (target.kind === 'cloud') {
        await prepareCloudCreation(cloudClient, target.workspace);
        if (version !== generation.current) return;
        router.push({
          pathname: action === 'invite' ? '/cloud-invitations' : '/cloud-create-channel',
          params: {
            instanceId: target.workspace.instanceId,
            organizationId: target.workspace.organizationId,
            accountScope: target.workspace.scope,
          },
        });
      }
    } catch (e) {
      if (version === generation.current)
        showAppDialog(t.createHere, cloudError(e), [{ text: t.close, style: 'cancel' }]);
    } finally {
      pendingCreation.current = false;
      setBusy(false);
    }
  };
  if (creationMenuGroups({ scope, targets }).length === 0) return null;
  return (
    <View ref={mount} collapsable={false}>
      <CreationMenuButton
        scope={scope}
        targets={targets}
        size={size}
        busy={busy}
        onPick={(action, target) => void choose(action, target)}
      />
    </View>
  );
}
