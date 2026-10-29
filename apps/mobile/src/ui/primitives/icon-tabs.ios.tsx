import { Host, Image, Picker } from '@expo/ui/swift-ui';
import { accessibilityLabel, pickerStyle, tag } from '@expo/ui/swift-ui/modifiers';

import { useDesignTheme } from '../design/theme';
import type { IconTabsProps } from './icon-tabs';

type Symbol = NonNullable<Parameters<typeof Image>[0]['systemName']>;

export function IconTabs<T extends string>({ label, options, value, onChange }: IconTabsProps<T>) {
  const theme = useDesignTheme();
  return (
    <Host
      key={theme.scheme}
      testID="profile-tabs"
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      style={{ alignSelf: 'stretch' }}
    >
      <Picker<T>
        selection={value}
        onSelectionChange={onChange}
        modifiers={[pickerStyle('segmented'), accessibilityLabel(label)]}
      >
        {options.map((option) => (
          <Image
            key={option.value}
            systemName={option.symbol as Symbol}
            modifiers={[tag(option.value), accessibilityLabel(option.label)]}
          />
        ))}
      </Picker>
    </Host>
  );
}
