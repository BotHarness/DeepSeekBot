import { nativeApplicationVersion, nativeBuildVersion } from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import * as Device from 'expo-device';
import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  connectionDiagnosticReport,
  type ConnectionDiagnostic,
} from '../../host/connection-diagnostic';

export interface ConnectionFailureActionsProps {
  failure: ConnectionDiagnostic;
  id: string;
}

export function useConnectionFailureActions(failure: ConnectionDiagnostic) {
  const current = useRef(failure);
  current.current = failure;
  const initial = { failure, expanded: false, copied: false, copyFailed: false };
  const [interaction, setInteraction] = useState(initial);
  const state = interaction.failure === failure ? interaction : initial;
  const report = connectionDiagnosticReport(failure, {
    platform: Platform.OS,
    osVersion: Device.osVersion,
    version: nativeApplicationVersion,
    build: nativeBuildVersion,
  });
  return {
    ...state,
    report,
    toggle: () => setInteraction({ ...state, expanded: !state.expanded }),
    copy: () => {
      void Clipboard.setStringAsync(report).then(
        () => {
          if (current.current === failure)
            setInteraction((latest) => ({
              ...(latest.failure === failure ? latest : initial),
              copied: true,
              copyFailed: false,
            }));
        },
        () => {
          if (current.current === failure)
            setInteraction((latest) => ({
              ...(latest.failure === failure ? latest : initial),
              copied: false,
              copyFailed: true,
            }));
        },
      );
    },
  };
}
