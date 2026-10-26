import { Platform } from 'react-native';
import type { ActivityTarget } from '../../host/live-activity-session';
import { Button } from '../primitives/creation-button';
import { useRequestActivityAction } from './request-activity-action';

export function RequestActivityControl({ target }: { target: ActivityTarget | undefined }) {
  return Platform.OS === 'ios' ? <ActivityControl target={target} /> : null;
}

function ActivityControl({ target }: { target: ActivityTarget | undefined }) {
  const action = useRequestActivityAction(target);
  return (
    <Button
      testID="request-activity"
      label={action.label}
      disabled={action.disabled}
      busy={action.busy}
      onPress={action.onPress}
      variant="text"
    />
  );
}
