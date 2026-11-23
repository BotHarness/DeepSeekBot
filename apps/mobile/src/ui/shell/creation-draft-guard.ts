import { usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { Keyboard } from 'react-native';

import { showAppDialog } from '../primitives/app-dialog';
import { useStrings } from '../strings';

export function useCreationDraftGuard(started: boolean, discard: () => Promise<unknown>) {
  const t = useStrings();
  const [leaving, setLeaving] = useState(false);
  const disablePrevention = usePreventRemove(started && !leaving, ({ repeat }) => {
    Keyboard.dismiss();
    const leave = () => {
      setLeaving(true);
      repeat();
    };
    showAppDialog(t.creationDraft.title, t.creationDraft.message, [
      {
        text: t.creationDraft.discard,
        style: 'destructive',
        onPress: () => void discard().finally(leave),
      },
      { text: t.creationDraft.keep, onPress: leave },
      { text: t.creationDraft.edit, style: 'cancel' },
    ]);
  });
  return (action: () => void) => {
    setLeaving(true);
    disablePrevention();
    action();
  };
}
