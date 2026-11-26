import { Button, FilledTonalIconButton, Host, Icon, Row, Text } from '@expo/ui/jetpack-compose';
import {
  defaultMinSize,
  fillMaxWidth,
  semantics,
  size,
  testID,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { View } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { materialButton, materialIconButton, space } from '../../ui/design/tokens';
import type { SessionDrawerFooterActionsProps } from './session-drawer-footer-actions';

export type { SessionDrawerFooterActionsProps } from './session-drawer-footer-actions';

export function SessionDrawerFooterActions({
  searchLabel,
  createLabel,
  canSearch,
  canCreate,
  onSearch,
  onCreate,
}: SessionDrawerFooterActionsProps) {
  const theme = useDesignTheme();
  return (
    <View style={{ flex: 1 }}>
      <Host
        matchContents={{ vertical: true }}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        ignoreSafeAreaKeyboardInsets
      >
        <Row
          horizontalArrangement={{ spacedBy: space.x3 }}
          verticalAlignment="center"
          modifiers={[fillMaxWidth()]}
        >
          <FilledTonalIconButton
            enabled={canSearch}
            onClick={onSearch}
            modifiers={[
              size(theme.touch, theme.touch),
              semantics({ contentDescription: searchLabel }),
              testID('session-drawer-search'),
            ]}
          >
            <Icon
              source={require('../../../assets/header/search.xml')}
              size={materialIconButton.iconSize}
            />
          </FilledTonalIconButton>
          {canCreate ? (
            <Button
              onClick={onCreate}
              modifiers={[
                weight(1),
                defaultMinSize({ minHeight: theme.touch }),
                testID('session-drawer-new'),
              ]}
            >
              <Row
                horizontalArrangement={{ spacedBy: materialButton.iconGap }}
                verticalAlignment="center"
              >
                <Icon
                  source={require('../../../assets/button/plus.xml')}
                  size={materialButton.icon}
                />
                <Text style={{ typography: 'labelLarge', textAlign: 'center' }}>{createLabel}</Text>
              </Row>
            </Button>
          ) : null}
        </Row>
      </Host>
    </View>
  );
}
