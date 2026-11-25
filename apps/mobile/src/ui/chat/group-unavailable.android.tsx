import { Box, Button, Column, Host, Icon, Text } from '@expo/ui/jetpack-compose';
import { fillMaxSize, padding, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { groupUnavailable, space } from '../design/tokens';
import { useStrings } from '../strings';
import { View } from 'react-native';
import { groupUnavailableCopy, type GroupUnavailableProps } from './group-unavailable-copy';

export function GroupUnavailable({ onBack, reason }: GroupUnavailableProps) {
  const theme = useDesignTheme();
  const roles = useMaterialRoles();
  const t = useStrings();
  if (reason === undefined) return <View testID="group-unavailable" style={{ flex: 1 }} />;
  const copy = groupUnavailableCopy(t, reason);
  return (
    <Host style={{ flex: 1 }} colorScheme={theme.scheme} seedColor={theme.color.accent}>
      <Box
        contentAlignment="center"
        modifiers={[
          fillMaxSize(),
          padding(space.x6, space.x6, space.x6, space.x6),
          testID('group-unavailable'),
        ]}
      >
        <Column horizontalAlignment="center" verticalArrangement={{ spacedBy: space.x5 }}>
          <Icon
            source={require('../../../assets/button/message-square.xml')}
            size={groupUnavailable.icon * theme.fontScale}
            tint={roles.onSurfaceVariant}
          />
          <Text
            color={roles.onSurface}
            style={{ typography: 'headlineSmall', textAlign: 'center' }}
          >
            {copy.title}
          </Text>
          <Text
            color={roles.onSurfaceVariant}
            style={{ typography: 'bodyMedium', textAlign: 'center' }}
          >
            {copy.body}
          </Text>
          <Button onClick={onBack} modifiers={[testID('group-unavailable-back')]}>
            <Text>{t.backToChats}</Text>
          </Button>
        </Column>
      </Box>
    </Host>
  );
}
