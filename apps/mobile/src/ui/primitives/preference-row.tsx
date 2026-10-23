import { useState } from 'react';
import { View } from 'react-native';
import { SettingsRow } from './settings-row';

export type PreferenceRowProps<T extends string> = {
  title: string;
  testID: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
};

export function PreferenceRow<T extends string>({
  title,
  testID,
  value,
  options,
  onChange,
}: PreferenceRowProps<T>) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <SettingsRow
        title={title}
        detail={options.find((option) => option.value === value)?.label ?? value}
        testID={testID}
        expanded={open}
        onPress={() => setOpen(!open)}
      />
      {open
        ? options.map((option) => (
            <SettingsRow
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
