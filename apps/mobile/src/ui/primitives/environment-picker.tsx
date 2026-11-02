import { View } from 'react-native';
import { Button } from './button';
import { space } from '../design/tokens';

export interface EnvironmentPickerProps {
  label: string;
  placeholder: string;
  value: string;
  options: { value: string; label: string }[];
  onChange(value: string): void;
}

export function EnvironmentPicker({ options, value, onChange }: EnvironmentPickerProps) {
  return (
    <View style={{ gap: space.x2 }}>
      {options.map((option) => (
        <Button
          key={option.value}
          testID={`create-bot-host-${option.value}`}
          label={option.label}
          tone={option.value === value ? 'primary' : 'secondary'}
          onPress={() => onChange(option.value)}
        />
      ))}
    </View>
  );
}
