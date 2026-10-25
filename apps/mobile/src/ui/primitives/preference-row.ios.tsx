import { Host, Label, Menu, Picker, RNHostView } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  buttonStyle,
  frame,
  pickerStyle,
  tag,
} from '@expo/ui/swift-ui/modifiers';
import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { RowIcon, rowSymbol } from './row-icon';
import { SettingsRow } from './settings-row';
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
  const selected = options.find((option) => option.value === value)?.label ?? value;
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
                detail={selected}
                leading={<RowIcon name={icon} />}
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
            <Label
              key={option.value}
              title={option.label}
              systemImage={rowSymbol(option.icon).ios}
              modifiers={[tag(option.value)]}
            />
          ))}
        </Picker>
      </Menu>
    </Host>
  );
}
