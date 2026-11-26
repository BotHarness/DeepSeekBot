import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { errorText, type WorkspaceOption } from '@botharness/host-client/bot-settings';
import { newFolderNameProblem, newFolderRefusal } from '@botharness/host-client/new-folder';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
import { SheetActions, SheetHeading, SHEET_GROUP } from './sheet';

export type CreateFolder = (parent: string, name: string) => Promise<WorkspaceOption>;

export function NewFolderPage({
  parent,
  create,
  onCreated,
  onBack,
  onBusy,
}: {
  parent: { path: string; name: string };
  create: CreateFolder;
  onCreated(workspace: WorkspaceOption): void;
  onBack(): void;
  onBusy?(busy: boolean): void;
}) {
  const t = useStrings();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string>();
  const pending = useRef(false);
  const problem = newFolderNameProblem(name);
  const shown =
    problem === undefined || problem === 'empty' ? refused : t.newFolderProblem[problem];

  const submit = async () => {
    if (pending.current || problem !== undefined) return;
    pending.current = true;
    setBusy(true);
    onBusy?.(true);
    setRefused(undefined);
    try {
      const workspace = await create(parent.path, name.trim());
      onCreated(workspace);
    } catch (cause) {
      const refusal = newFolderRefusal(cause);
      setRefused(
        refusal === undefined
          ? `${t.newFolderFailed} ${errorText(cause)}`
          : t.newFolderRefusal[refusal],
      );
    } finally {
      pending.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  };

  return (
    <KeyboardFormScroll enabled={false} nestedScrollEnabled style={{ flexShrink: 1 }}>
      <SheetHeading>{t.newFolderLocation}</SheetHeading>
      <SettingsGroupItem first last on={SHEET_GROUP}>
        <SettingsRow
          title={parent.name}
          detail={parent.path}
          icon="folder"
          iconTone="muted"
          on={SHEET_GROUP}
        />
      </SettingsGroupItem>
      {Platform.OS === 'android' ? null : <SheetHeading>{t.newFolderName}</SheetHeading>}
      <View style={{ paddingHorizontal: space.x5, gap: space.x3 }}>
        <TextField
          testID="new-folder-name"
          accessibilityLabel={t.newFolderName}
          placeholder={t.newFolderPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          returnKeyType="done"
          value={name}
          editable={!busy}
          invalid={shown !== undefined}
          onChangeText={(next) => {
            setName(next);
            setRefused(undefined);
          }}
          onSubmitEditing={() => void submit()}
        />
        {shown === undefined ? null : (
          <Text
            variant="meta"
            tone="danger"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {shown}
          </Text>
        )}
      </View>
      <SheetActions>
        <Button label={t.back} on="canvas" disabled={busy} onPress={onBack} />
        <Button
          testID="new-folder-create"
          label={t.newFolderCreate}
          tone="primary"
          on="canvas"
          busy={busy}
          disabled={busy || problem !== undefined}
          onPress={() => void submit()}
        />
      </SheetActions>
    </KeyboardFormScroll>
  );
}
