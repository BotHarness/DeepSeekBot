import { View } from 'react-native';
import { SettingsRow } from '../primitives/settings-row';
import { CheckIcon } from '../shell/icons';
import { useDesignTheme } from '../design/theme';
import { edge, space } from '../design/tokens';

export type SectionChoiceProps = {
  title: string;
  testID: string;
  selected?: boolean;
  onPress?: (() => void) | undefined;
};

export function SectionChoice({ selected = false, ...props }: SectionChoiceProps) {
  const theme = useDesignTheme();
  return (
    <SettingsRow
      {...props}
      selected={selected}
      trailing={selected ? <CheckIcon size={space.x6} color={theme.color.accent} /> : null}
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
