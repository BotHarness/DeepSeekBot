import { Button, Text } from '@expo/ui/swift-ui';
import { font } from '@expo/ui/swift-ui/modifiers';
import { useStrings } from '../strings';
import {
  useConnectionFailureActions,
  type ConnectionFailureActionsProps,
} from './connection-failure-state';

export function ConnectionFailureActions({ failure, id }: ConnectionFailureActionsProps) {
  const t = useStrings();
  const state = useConnectionFailureActions(failure);
  return (
    <>
      <Button
        testID={`connection-details-${id}`}
        label={state.expanded ? t.connectionDiagnostic.hide : t.connectionDiagnostic.view}
        systemImage="info.circle"
        onPress={state.toggle}
      />
      {state.expanded ? (
        <Text testID={`connection-report-${id}`} modifiers={[font({ textStyle: 'body' })]}>
          {state.report}
        </Text>
      ) : null}
      <Button
        testID={`connection-copy-${id}`}
        label={state.copied ? t.connectionDiagnostic.copied : t.connectionDiagnostic.copy}
        systemImage="doc.on.doc"
        onPress={state.copy}
      />
      {state.copyFailed ? <Text>{t.connectionDiagnostic.copyFailed}</Text> : null}
    </>
  );
}
