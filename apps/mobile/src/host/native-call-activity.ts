import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import {
  CALL_ACTIVITY_TARGETS,
  type CallActivityAction,
  type CallActivityNative,
  type CallActivityProps,
} from '../ui/chat/call-activity';

const supported = () =>
  Platform.OS === 'ios' && requireOptionalNativeModule('ExpoWidgets') !== null;
const factory = async () => (await import('../ui/widgets/call-activity')).callActivity;
const payload = ({ palette: _palette, ...props }: CallActivityProps): CallActivityProps => props;

export const callActivityNative: CallActivityNative = {
  async start(props: CallActivityProps) {
    if (!supported()) return undefined;
    const activities = await factory();
    for (const stale of activities.getInstances())
      await stale.end('immediate').catch(() => undefined);
    const activity = activities.start(payload(props));
    return {
      update: (next) => activity.update(payload(next)),
      end: () => activity.end('immediate'),
    };
  },
};

export function onCallActivityAction(onAction: (action: CallActivityAction) => void): () => void {
  if (!supported()) return () => undefined;
  let removed = false;
  let remove: (() => void) | undefined;
  void import('expo-widgets').then(({ addUserInteractionListener }) => {
    if (removed) return;
    const subscription = addUserInteractionListener((event) => {
      if (event.target === CALL_ACTIVITY_TARGETS.hangUp) onAction('hang-up');
      else if (event.target === CALL_ACTIVITY_TARGETS.mute) onAction('mute');
    });
    remove = () => subscription.remove();
  });
  return () => {
    removed = true;
    remove?.();
  };
}
