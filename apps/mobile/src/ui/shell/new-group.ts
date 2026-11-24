import { router } from 'expo-router';
import { cloudAvailable } from '../../cloud/available';
import { targetsFor, type CreationTarget } from '../../host/creation-targets';

export function startNewGroup(
  scope: string,
  targets: readonly CreationTarget[],
  openCloud: (target: Extract<CreationTarget, { kind: 'cloud' }>) => void,
): void {
  const choices = targetsFor('channel', scope, targets);
  const target = scope === 'all' ? undefined : choices[0];
  if (scope === 'all' && cloudAvailable && choices.some((choice) => choice.kind === 'cloud')) {
    router.push('/create-group-target');
  } else if (target?.kind === 'cloud') {
    openCloud(target);
  } else {
    router.push({
      pathname: '/create-channel',
      params: target ? { entry: 'host', hostId: target.hostId } : { entry: 'all' },
    });
  }
}
