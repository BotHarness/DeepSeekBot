import { Linking } from 'react-native';

import type { DictationProblem } from '../../host/speech';
import { showAppDialog } from '../primitives/app-dialog';
import { t } from '../strings';

export function showDictationProblem(problem: DictationProblem): void {
  const message =
    problem === 'denied'
      ? t.dictationDenied
      : problem === 'unavailable'
        ? t.dictationUnavailable
        : t.dictationFailed;
  showAppDialog(
    t.dictationProblem,
    message,
    problem === 'denied'
      ? [
          { text: t.cancel, style: 'cancel' },
          { text: t.openSettings, onPress: () => Linking.openSettings() },
        ]
      : [{ text: t.done }],
  );
}
