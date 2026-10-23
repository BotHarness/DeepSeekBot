import type { BotPickerCandidate } from './bot-picker-sheet';
import {
  Host,
  ModalBottomSheet,
  RNHostView,
  Row,
  Text,
  IconButton,
  Icon,
  Checkbox,
} from '@expo/ui/jetpack-compose';
import {
  defaultMinSize,
  fillMaxWidth,
  padding,
  semantics,
  testID,
  toggleable,
  weight,
} from '@expo/ui/jetpack-compose/modifiers';
import { FlatList, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BotPickerSheetProps } from './bot-picker-sheet';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import { SheetCallout, SheetNote } from './sheet';

export function BotPickerSheet<T extends BotPickerCandidate>(props: BotPickerSheetProps<T>) {
  const t = useStrings();
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <ModalBottomSheet onDismissRequest={props.onClose} skipPartiallyExpanded>
        <RNHostView>
          <View
            ref={props.mount}
            style={{ height: height - insets.top - insets.bottom - theme.touch * 2 }}
          >
            <Host
              matchContents={{ vertical: true }}
              colorScheme={theme.scheme}
              seedColor={theme.color.accent}
            >
              <Row
                verticalAlignment="center"
                modifiers={[fillMaxWidth(), padding(space.x3, 0, space.x3, space.x3)]}
              >
                <IconButton
                  onClick={props.onClose}
                  modifiers={[
                    defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
                    semantics({ contentDescription: t.close }),
                    testID('invite-bots-close'),
                  ]}
                >
                  <Icon
                    source={require('../../../assets/toolbar/close.png')}
                    size={theme.type.title.line}
                  />
                </IconButton>
                <Text
                  style={{ typography: 'titleLarge', textAlign: 'center' }}
                  modifiers={[weight(1)]}
                >
                  {props.title}
                </Text>
                <IconButton
                  enabled={props.canConfirm}
                  onClick={() => void props.onConfirm()}
                  colors={{ contentColor: theme.color.accent }}
                  modifiers={[
                    defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
                    semantics({ contentDescription: t.done }),
                    testID('invite-bots-confirm'),
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
                </IconButton>
              </Row>
            </Host>
            {props.error === undefined ? null : (
              <SheetCallout tone="danger">{props.error}</SheetCallout>
            )}
            {props.candidates.length === 0 ? (
              <SheetNote>{t.groupInviteNone}</SheetNote>
            ) : (
              <FlatList
                style={{ flex: 1 }}
                data={props.candidates}
                extraData={[props.selected, props.busy]}
                keyExtractor={(bot) => bot.slug}
                nestedScrollEnabled
                contentContainerStyle={{ paddingHorizontal: space.x5, paddingBottom: space.x5 }}
                renderItem={({ item }) => (
                  <Host
                    matchContents={{ vertical: true }}
                    colorScheme={theme.scheme}
                    seedColor={theme.color.accent}
                  >
                    <Row
                      verticalAlignment="center"
                      modifiers={[
                        fillMaxWidth(),
                        defaultMinSize({ minHeight: theme.touch }),
                        padding(space.x3, space.x3, space.x3, space.x3),
                        testID(`invite-bot-${item.slug}`),
                        toggleable(props.selected.has(item.slug), () => props.onToggle(item.slug), {
                          role: 'checkbox',
                          enabled: !props.busy,
                        }),
                      ]}
                    >
                      <RNHostView matchContents>
                        <View>{props.renderLeading?.(item)}</View>
                      </RNHostView>
                      <Text modifiers={[weight(1), padding(space.x3, 0, space.x3, 0)]}>
                        {item.displayName}
                      </Text>
                      <Checkbox value={props.selected.has(item.slug)} enabled={!props.busy} />
                    </Row>
                  </Host>
                )}
              />
            )}
          </View>
        </RNHostView>
      </ModalBottomSheet>
    </Host>
  );
}
