import { Button, ContentUnavailableView, Host } from '@expo/ui/swift-ui';
import { accessibilityIdentifier, buttonStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { GroupUnavailableProps } from './group-unavailable';

export function GroupUnavailable({ onBack }: GroupUnavailableProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  return (
    <Host style={{ flex: 1 }} colorScheme={theme.scheme}>
      <ContentUnavailableView
        title={t.groupUnavailableTitle}
        systemImage="bubble.left.and.bubble.right"
        description={t.groupUnavailableBody}
        actions={
          <Button
            label={t.backToChats}
            onPress={onBack}
            modifiers={[
              accessibilityIdentifier('group-unavailable-back'),
              buttonStyle('borderedProminent'),
              tint(theme.color.accent),
            ]}
          />
        }
      />
    </Host>
  );
}
