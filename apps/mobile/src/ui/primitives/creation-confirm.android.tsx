import { Host, Icon, IconButton, LoadingIndicator } from '@expo/ui/jetpack-compose';
import { defaultMinSize, semantics, size, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import type { CreationConfirmProps } from './creation-confirm';

export function CreationConfirm(props: CreationConfirmProps) {
  const theme = useDesignTheme();
  return (
    <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
      <IconButton
        enabled={!props.disabled && !props.busy}
        onClick={props.onPress}
        colors={{ contentColor: theme.color.accent }}
        modifiers={[
          defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
          semantics({ contentDescription: props.label }),
          testID(props.testID),
        ]}
      >
        {props.busy ? (
          <LoadingIndicator
            color={theme.color.accent}
            modifiers={[size(theme.type.title.line, theme.type.title.line)]}
          />
        ) : (
          <Icon
            source={require('../../../assets/toolbar/check.png')}
            size={theme.type.title.line}
          />
        )}
      </IconButton>
    </Host>
  );
}
