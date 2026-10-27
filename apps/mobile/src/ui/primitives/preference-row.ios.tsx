import { Host, Label, Menu, Picker, RNHostView, Text } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  buttonStyle,
  foregroundStyle,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { rowSymbol } from './row-icon';
import { useSettingsFormPlace } from './settings-form-context';
import { SettingsRow } from './settings-row';
import { SystemSymbol } from './system-symbol';
import { Text as RowText } from './text';
import type { PreferenceRowProps } from './preference-row';

export function PreferenceRow<T extends string>({
  title,
  icon,
  on = 'sheet',
  testID,
  value,
  options,
  onChange,
}: PreferenceRowProps<T>) {
  const theme = useDesignTheme();
  const place = useSettingsFormPlace();
  const selected = options.find((option) => option.value === value)?.label ?? value;
  if (place !== false)
    return (
      <Picker<T>
        testID={testID}
        label={
          <Label
            title={title}
            systemImage={rowSymbol(icon).ios}
            modifiers={[foregroundStyle({ type: 'hierarchical', style: 'primary' })]}
          />
        }
        selection={value}
        onSelectionChange={onChange}
        modifiers={[pickerStyle('menu'), accessibilityLabel(title)]}
      >
        {options.map((option) => (
          <Text key={option.value} modifiers={[tag(option.value)]}>
            {option.label}
          </Text>
        ))}
      </Picker>
    );
  return (
    <Host
      colorScheme={theme.scheme}
      matchContents={{ vertical: true }}
      style={{ alignSelf: 'stretch', minHeight: theme.touch }}
    >
      <Menu
        testID={testID}
        label={
          <RNHostView matchContents={{ vertical: true }}>
            <View pointerEvents="none" accessible={false} accessibilityElementsHidden>
              <SettingsRow
                on={on}
                title={title}
                icon={icon}
                trailing={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.x2 }}>
                    <RowText tone="muted" numberOfLines={1}>
                      {selected}
                    </RowText>
                    <SystemSymbol
                      name="chevron.up.chevron.down"
                      size={theme.type.meta.size}
                      color={theme.color.muted}
                    />
                  </View>
                }
              />
            </View>
          </RNHostView>
        }
        modifiers={[
          buttonStyle('plain'),
          frame({ maxWidth: Infinity, alignment: 'leading' }),
          accessibilityElement('ignore'),
          accessibilityLabel(`${title}, ${selected}`),
        ]}
      >
        <Picker<T>
          selection={value}
          onSelectionChange={onChange}
          modifiers={[pickerStyle('inline')]}
        >
          {options.map((option) => (
            <Text key={option.value} modifiers={[tag(option.value)]}>
              {option.label}
            </Text>
          ))}
        </Picker>
      </Menu>
    </Host>
  );
}
