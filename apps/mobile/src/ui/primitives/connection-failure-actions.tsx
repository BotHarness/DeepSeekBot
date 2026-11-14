import { View } from 'react-native';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import { Button } from './button';
import { Text } from './text';
import {
  useConnectionFailureActions,
  type ConnectionFailureActionsProps,
} from './connection-failure-state';

export function ConnectionFailureActions({ failure, id }: ConnectionFailureActionsProps) {
  const t = useStrings();
  const state = useConnectionFailureActions(failure);
  return (
    <View style={{ gap: space.x2, padding: space.x4 }}>
      <Button
        testID={`connection-details-${id}`}
        variant="text"
        label={state.expanded ? t.connectionDiagnostic.hide : t.connectionDiagnostic.view}
        onPress={state.toggle}
      />
      {state.expanded ? (
        <Text testID={`connection-report-${id}`} selectable>
          {state.report}
        </Text>
      ) : null}
      <Button
        testID={`connection-copy-${id}`}
        variant="text"
        label={state.copied ? t.connectionDiagnostic.copied : t.connectionDiagnostic.copy}
        onPress={state.copy}
      />
      {state.copyFailed ? <Text tone="danger">{t.connectionDiagnostic.copyFailed}</Text> : null}
    </View>
  );
}
