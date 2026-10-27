import { usePathname } from 'expo-router';
import { useRef } from 'react';
import { AppState, View, type ViewInstance } from 'react-native';
import { botCreation } from '../../host/native-bot-creation';
import { hostSession } from '../../host/host-session';
import { createCreationVisibility } from '../../host/bot-creation-visibility';
import { useMounted } from '../mounted';
import { showAppDialog } from '../primitives/app-dialog';
import { t } from '../strings';
import { creationCopy as copy } from './bot-creation-copy';

export function BotCreationNotice() {
  const path = usePathname();
  const visibility = useRef(createCreationVisibility(AppState.currentState === 'active')).current;
  const mounted = useMounted<ViewInstance>(() => {
    visibility.focus();
    const recover = () => {
      const current = botCreation.getSnapshot();
      if (
        AppState.currentState !== 'active' ||
        !current.loaded ||
        current.busy ||
        hostSession.getState().saved === undefined ||
        current.record.kind !== 'submitted' ||
        current.receipt?.status === 'created'
      )
        return;
      if (current.error && current.error !== 'unreachable' && current.error !== 'invalid-receipt')
        return;
      void botCreation.resume();
    };
    const notice = () => {
      if (botCreation.getSnapshot().notice !== 'avatar-failed') return;
      botCreation.dismissNotice();
      showAppDialog(copy.avatarFailedTitle, copy.avatarFailed, [{ text: t.done }]);
    };
    const offNotice = botCreation.subscribe(notice);
    recover();
    let live = true;
    void botCreation.ready.then(() => {
      if (live) recover();
    });
    const offHost = hostSession.subscribe(recover);
    const off = AppState.addEventListener('change', (state) => {
      visibility.appState(state === 'active');
      recover();
    });
    const timer = setInterval(recover, 10_000);
    return () => {
      live = false;
      offNotice();
      visibility.blur();
      offHost();
      off.remove();
      clearInterval(timer);
    };
  }, [path, visibility]);
  return <View ref={mounted} />;
}
