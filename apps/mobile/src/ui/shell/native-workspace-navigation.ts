import { useNavigationContainerRef } from 'expo-router';
import type { RefCallback } from 'react';
import type { ViewInstance } from 'react-native';
import { cloudClient } from '../../cloud/native';
import { cloudViewScope, type CloudWorkspace } from '../../cloud/workspace-directory';
import { hostSession } from '../../host/host-session';
import { useMounted } from '../mounted';
import type { ChannelNavigation } from './channel-navigation';
import {
  removeScopedRoutes,
  resetWorkspaceRoot,
  selectCloudWorkspace,
} from './workspace-navigation';

let rootNavigation: ChannelNavigation | undefined;

export function showWorkspaceRoot(): boolean {
  return rootNavigation ? resetWorkspaceRoot(rootNavigation) : false;
}

export function chooseCloudWorkspace(
  workspace: CloudWorkspace,
  current: () => boolean,
): Promise<boolean> {
  if (!rootNavigation) return Promise.resolve(false);
  return selectCloudWorkspace(
    rootNavigation,
    workspace,
    {
      scope: (id) =>
        cloudViewScope(cloudClient.getSnapshot().rows.find((row) => row.config.instanceId === id)),
      enter: async (target) => {
        if (target.role === 'guest') await cloudClient.whoami(target.instanceId);
        else await cloudClient.useOrganization(target.instanceId, target.organizationId);
      },
    },
    current,
  );
}

export function useWorkspaceNavigation(invalidate: () => void): RefCallback<ViewInstance> {
  const navigation = useNavigationContainerRef();
  return useMounted(() => {
    rootNavigation = navigation;
    let hosts = new Map(hostSession.getState().hosts.map((host) => [host.hostId, host.credential]));
    let accounts = new Map(
      cloudClient.getSnapshot().rows.map((row) => [row.config.instanceId, cloudViewScope(row)]),
    );
    const checkHosts = () => {
      const next = new Map(
        hostSession.getState().hosts.map((host) => [host.hostId, host.credential]),
      );
      const removed = new Set(
        [...hosts].filter(([id, credential]) => next.get(id) !== credential).map(([id]) => id),
      );
      hosts = next;
      if (removed.size) invalidate();
      removeScopedRoutes(navigation, removed, new Set());
    };
    const checkAccounts = () => {
      const next = new Map(
        cloudClient.getSnapshot().rows.map((row) => [row.config.instanceId, cloudViewScope(row)]),
      );
      const changed = new Set(
        [...accounts].filter(([id, scope]) => next.get(id) !== scope).map(([id]) => id),
      );
      accounts = next;
      if (changed.size) invalidate();
      removeScopedRoutes(navigation, new Set(), changed);
    };
    const offHosts = hostSession.subscribe(checkHosts);
    const offAccounts = cloudClient.subscribe(checkAccounts);
    return () => {
      invalidate();
      offHosts();
      offAccounts();
      if (rootNavigation === navigation) rootNavigation = undefined;
    };
  }, [navigation, invalidate]);
}
