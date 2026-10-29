import { View } from 'react-native';
import { SettingsRow } from '../primitives/settings-row';
import { useDesignTheme } from '../design/theme';
import { edge } from '../design/tokens';

export type SectionChoiceProps = {
  title: string;
  testID: string;
  selected?: boolean;
  onPress?: (() => void) | undefined;
};

export function SectionChoice({ selected = false, ...props }: SectionChoiceProps) {
  return (
    <SettingsRow
      {...props}
      selected={selected}
      control={selected ? { kind: 'check' } : undefined}
    />
  );
}

export function SectionChoiceDivider() {
  const theme = useDesignTheme();
  return (
    <View
      testID="section-choice-divider"
      accessibilityRole="separator"
      style={{ borderBottomWidth: edge.hairline, borderBottomColor: theme.layer.sheet.divider }}
    />
  );
}
