import { Host, ListItem } from '@expo/ui';
import { accessibilityAddTraits, disabled, frame, padding } from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Divider } from '@expo/ui/swift-ui';
import { CheckIcon } from '../shell/icons';
import type { SectionChoiceProps } from './section-choice';

export function SectionChoice({ title, testID, onPress, selected = false }: SectionChoiceProps) {
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
        trailing={selected ? <CheckIcon size={space.x6} color={theme.color.accent} /> : null}
        {...(onPress ? { onPress } : {})}
        modifiers={[
          padding({ all: space.x4 }),
          frame({ minHeight: theme.touch }),
          disabled(onPress === undefined),
          accessibilityAddTraits(selected ? ['isSelected'] : []),
        ]}
      >
        {title}
      </ListItem>
    </Host>
  );
}

export function SectionChoiceDivider() {
  const theme = useDesignTheme();
  return (
    <Host matchContents={{ vertical: true }} colorScheme={theme.scheme}>
      <Divider />
    </Host>
  );
}
