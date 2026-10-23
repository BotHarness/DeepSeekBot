import {
  AlertDialog,
  Column,
  Host,
  ListItem,
  RNHostView,
  ModalBottomSheet,
  Text,
  TextButton,
  type ButtonColors,
} from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useSyncExternalStore } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { t } from '../strings';
import { appDialogs, type DialogAction } from './dialog-state';
import { materialMenu, space } from '../design/tokens';
import { MaterialMenuGroup } from './material-menu.android';
import { MenuIcon } from './menu-icon';

export function AppDialogHost() {
  const shown = useSyncExternalStore(
    appDialogs.subscribe,
    appDialogs.getSnapshot,
    appDialogs.getSnapshot,
  );
  const theme = useDesignTheme();
  if (Platform.OS !== 'android' || shown === undefined) return null;
  const choices = shown.actions.flatMap((action, index) =>
    action.style === 'cancel' ? [] : [{ action, index }],
  );
  const cancel = shown.actions.find((action) => action.style === 'cancel');
  const menu = shown.presentation === 'menu';
  const idle = shown.busy === undefined;
  const dismiss = () => appDialogs.dismiss();
  const colors = (action: DialogAction): ButtonColors => ({
    contentColor: action.style === 'destructive' ? theme.color.danger : theme.color.accent,
  });
  const choiceButton = ({ action, index }: { action: DialogAction; index: number }) => (
    <TextButton
      key={index}
      enabled={idle}
      colors={colors(action)}
      onClick={() => {
        void appDialogs.choose(index, shown.id);
      }}
    >
      <Text>{shown.busy === index ? `${action.text}…` : action.text}</Text>
    </TextButton>
  );
  if (menu)
    return (
      <Host
        key={shown.id}
        colorScheme={theme.scheme}
        seedColor={theme.color.accent}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
      >
        <ModalBottomSheet
          onDismissRequest={dismiss}
          skipPartiallyExpanded
          properties={{ shouldDismissOnBackPress: idle, shouldDismissOnClickOutside: idle }}
        >
          {shown.avatar === undefined ? null : (
            <Column
              horizontalAlignment="center"
              verticalArrangement={{ spacedBy: space.x3 }}
              modifiers={[
                fillMaxWidth(),
                padding(space.x5, 0, space.x5, space.x5),
                testID('action-menu-header'),
              ]}
            >
              <RNHostView matchContents>{shown.avatar}</RNHostView>
              <Text style={{ typography: 'titleMedium', textAlign: 'center' }}>{shown.title}</Text>
            </Column>
          )}
          <Column
            verticalArrangement={{ spacedBy: materialMenu.groupGap }}
            modifiers={[padding(space.x5, 0, space.x5, space.x5)]}
          >
            {shown.avatar === undefined ? (
              <ListItem>
                <ListItem.HeadlineContent>
                  <Text color={theme.color.muted}>{shown.title}</Text>
                </ListItem.HeadlineContent>
              </ListItem>
            ) : null}
            {[false, true].map((destructive) => {
              const group = choices.filter(
                ({ action }) => (action.style === 'destructive') === destructive,
              );
              return group.length === 0 ? null : (
                <MaterialMenuGroup
                  key={String(destructive)}
                  items={group.map(({ action, index }) => ({
                    key: String(index),
                    label: shown.busy === index ? `${action.text}…` : action.text,
                    disabled: !idle,
                    destructive,
                    icon: (
                      <MenuIcon
                        icon={action.icon ?? 'settings'}
                        color={destructive ? theme.color.danger : theme.color.muted}
                        size={materialMenu.iconSize}
                      />
                    ),
                    onPress: () => {
                      void appDialogs.choose(index, shown.id);
                    },
                  }))}
                />
              );
            })}
            {shown.error === undefined ? null : (
              <ListItem>
                <ListItem.HeadlineContent>
                  <Text color={theme.color.danger}>{`${t.dialogFailed} ${shown.error}`}</Text>
                </ListItem.HeadlineContent>
              </ListItem>
            )}
          </Column>
        </ModalBottomSheet>
      </Host>
    );
  const single = choices[0];
  return (
    <Host
      key={shown.id}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
      <AlertDialog
        onDismissRequest={dismiss}
        properties={{ dismissOnBackPress: idle, dismissOnClickOutside: idle }}
      >
        <AlertDialog.Title>
          <Text>{shown.title}</Text>
        </AlertDialog.Title>
        {shown.message === undefined && shown.error === undefined ? null : (
          <AlertDialog.Text>
            <Column>
              {shown.message === undefined ? null : <Text>{shown.message}</Text>}
              {shown.error === undefined ? null : (
                <Text color={theme.color.danger}>{`${t.dialogFailed} ${shown.error}`}</Text>
              )}
            </Column>
          </AlertDialog.Text>
        )}
        {single === undefined ? null : (
          <AlertDialog.ConfirmButton>{choiceButton(single)}</AlertDialog.ConfirmButton>
        )}
        {cancel === undefined ? null : (
          <AlertDialog.DismissButton>
            <TextButton enabled={idle} onClick={dismiss}>
              <Text>{cancel.text}</Text>
            </TextButton>
          </AlertDialog.DismissButton>
        )}
      </AlertDialog>
    </Host>
  );
}
