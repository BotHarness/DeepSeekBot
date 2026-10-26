import type { ComponentProps } from 'react';
import { Host } from '@expo/ui';
import { Toggle } from '@expo/ui/swift-ui';
import { controlSize, disabled, frame, toggleStyle } from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import type { FeedbackTag as SharedTag } from './feedback-tag';

export function FeedbackTag({
  label,
  selected,
  onPress,
  disabled: blocked,
  testID,
}: ComponentProps<typeof SharedTag>) {
  const theme = useDesignTheme();
  return (
    <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
      <Toggle
        label={label}
        isOn={selected}
        onIsOnChange={() => {
          if (!blocked) onPress();
        }}
        {...(testID ? { testID } : {})}
        modifiers={[
          toggleStyle('button'),
          controlSize('regular'),
          disabled(Boolean(blocked)),
          frame({ minHeight: theme.touch }),
        ]}
      />
    </Host>
  );
}
