import { useState } from 'react';
import { View } from 'react-native';
import { SettingsRow } from './settings-row';
import { type RowIconName } from './row-icon';
import type { LayerName } from '../design/layers';

export type PreferenceRowProps<T extends string> = {
  title: string;
  icon: RowIconName;
  on?: LayerName;
  testID: string;
  value: T;
  options: readonly { value: T; label: string; icon: RowIconName }[];
  onChange(value: T): void;
};

export function PreferenceRow<T extends string>({
  title,
  icon,
  on = 'sheet',
  testID,
  value,
  options,
  onChange,
}: PreferenceRowProps<T>) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <SettingsRow
        on={on}
        title={title}
        icon={icon}
        detail={options.find((option) => option.value === value)?.label ?? value}
        testID={testID}
        expanded={open}
        onPress={() => setOpen(!open)}
      />
      {open
        ? options.map((option) => (
            <SettingsRow
              on={on}
              key={option.value}
              title={option.label}
              selected={option.value === value}
              testID={`${testID}-${option.value}`}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
            />
          ))
        : null}
    </View>
  );
}
