import {
  AlertDialog,
  Column,
  HorizontalDivider,
  Host,
  ListItem,
  ModalBottomSheet,
  Text,
  TextButton,
  type ButtonColors,
} from '@expo/ui/jetpack-compose';
import { clickable } from '@expo/ui/jetpack-compose/modifiers';
import { useSyncExternalStore } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { t } from '../strings';
import { appDialogs, type DialogAction } from './dialog-state';

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
  const menu = choices.length > 1;
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
          <Column>
            <ListItem>
              <ListItem.HeadlineContent>
                <Text color={theme.color.muted}>{shown.title}</Text>
              </ListItem.HeadlineContent>
            </ListItem>
            {choices.map(({ action, index }) => (
              <Column key={index}>
                {action.style === 'destructive' ? <HorizontalDivider /> : null}
                <ListItem
                  {...(idle
                    ? {
                        modifiers: [
                          clickable(() => {
                            void appDialogs.choose(index, shown.id);
                          }),
                        ],
                      }
                    : {})}
                >
                  <ListItem.HeadlineContent>
                    <Text
                      {...(action.style === 'destructive' ? { color: theme.color.danger } : {})}
                    >
                      {shown.busy === index ? `${action.text}…` : action.text}
                    </Text>
                  </ListItem.HeadlineContent>
                </ListItem>
              </Column>
            ))}
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
