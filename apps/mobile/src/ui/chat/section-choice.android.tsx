import { Host, ListItem } from '@expo/ui';
import { useDesignTheme } from '../design/theme';
import type { SectionChoiceProps } from './section-choice';

export function SectionChoice({ title, testID, onPress }: SectionChoiceProps) {
  const theme = useDesignTheme();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
    >
      <ListItem
        testID={testID}
        {...(onPress ? { onPress } : {})}
        colors={{ containerColor: theme.layer.sheet.fill, contentColor: theme.color.fg }}
      >
        {title}
      </ListItem>
    </Host>
  );
}
