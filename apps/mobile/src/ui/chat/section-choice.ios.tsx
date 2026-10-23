import { Host, ListItem } from '@expo/ui';
import { disabled, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import type { SectionChoiceProps } from './section-choice';

export function SectionChoice({ title, testID, onPress }: SectionChoiceProps) {
  const theme = useDesignTheme();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      ignoreSafeArea="all"
    >
      <ListItem
        testID={testID}
        {...(onPress ? { onPress } : {})}
        modifiers={[
          padding({ all: space.x4 }),
          frame({ minHeight: theme.touch }),
          disabled(onPress === undefined),
        ]}
      >
        {title}
      </ListItem>
    </Host>
  );
}
