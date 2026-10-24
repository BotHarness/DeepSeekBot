import { Host, ListItem } from '@expo/ui';
import { HorizontalDivider, Icon } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import { useDesignTheme } from '../design/theme';
import type { SectionChoiceProps } from './section-choice';

export function SectionChoice({ title, testID, onPress, selected = false }: SectionChoiceProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
    >
      <ListItem
        testID={testID}
        modifiers={[
          semantics({
            contentDescription: selected ? `${title}, ${t.conversationSection.selected}` : title,
          }),
        ]}
        trailing={
          selected ? (
            <Icon
              source={require('../../../assets/toolbar/check.png')}
              tint={theme.color.accent}
              size={space.x6}
            />
          ) : undefined
        }
        {...(onPress ? { onPress } : {})}
        colors={{ containerColor: theme.layer.sheet.fill, contentColor: theme.color.fg }}
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
      <HorizontalDivider color={theme.layer.sheet.divider} />
    </Host>
  );
}
