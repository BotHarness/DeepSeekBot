import { Host } from '@expo/ui';
import { FilledIconButton, Icon, RNHostView } from '@expo/ui/jetpack-compose';
import { defaultMinSize, semantics, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from './loading-indicator';
import type { SheetSaveButtonProps } from './sheet-save-button';

export function SheetSaveButton(props: SheetSaveButtonProps) {
  const theme = useDesignTheme();
  return (
    <Host matchContents colorScheme={theme.scheme} seedColor={theme.color.accent}>
      <FilledIconButton
        enabled={!props.disabled && !props.busy}
        onClick={props.onPress}
        colors={{ containerColor: theme.color.accent, contentColor: theme.color.onAccent }}
        modifiers={[
          defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
          semantics({ contentDescription: props.label }),
          testID(props.testID),
        ]}
      >
        {props.busy ? (
          <RNHostView matchContents>
            <LoadingIndicator />
          </RNHostView>
        ) : (
          <Icon
            source={require('../../../assets/toolbar/check.png')}
            size={theme.type.title.line}
          />
        )}
      </FilledIconButton>
    </Host>
  );
}
