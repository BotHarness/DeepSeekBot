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
import { BotAvatar } from '../bot-avatar';
import { useDesignTheme } from '../design/theme';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { radius, space } from '../design/tokens';
import { t } from '../strings';
import { SheetCallout, SheetNote } from './sheet';
import { useInviteSelection, type InviteSheetProps } from './invite-selection';

export function InviteSheet(props: InviteSheetProps) {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const draft = useInviteSelection(props);
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <ModalBottomSheet onDismissRequest={props.onClose} skipPartiallyExpanded>
        <RNHostView>
          <View style={{ height: height - insets.top - insets.bottom - theme.touch * 2 }}>
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
                  {t.groupInvite}
                </Text>
                <IconButton
                  enabled={draft.canConfirm}
                  onClick={() => void draft.confirm()}
                  colors={{ contentColor: theme.color.accent }}
                  modifiers={[
                    defaultMinSize({ minWidth: theme.touch, minHeight: theme.touch }),
                    semantics({ contentDescription: t.done }),
                    testID('invite-bots-confirm'),
                  ]}
                >
                  {draft.busy ? (
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
            {draft.error === undefined ? null : (
              <SheetCallout tone="danger">{draft.error}</SheetCallout>
            )}
            {draft.eligible.length === 0 ? (
              <SheetNote>{t.groupInviteNone}</SheetNote>
            ) : (
              <FlatList
                style={{ flex: 1 }}
                data={draft.eligible}
                extraData={[draft.selected, draft.busy]}
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
                        toggleable(draft.selected.has(item.slug), () => draft.toggle(item.slug), {
                          role: 'checkbox',
                          enabled: !draft.busy,
                        }),
                      ]}
                    >
                      <RNHostView matchContents>
                        <BotAvatar bot={item} size={theme.touch} ring={false} corner={radius.sm} />
                      </RNHostView>
                      <Text modifiers={[weight(1), padding(space.x3, 0, space.x3, 0)]}>
                        {item.displayName}
                      </Text>
                      <Checkbox value={draft.selected.has(item.slug)} enabled={!draft.busy} />
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
