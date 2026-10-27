import { Stack, useNavigation, usePreventRemove } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, View, type ViewInstance } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

import type { PinnedRole } from '../../host/bot-profile';
import type { HostClient } from '../../host/client';
import { memoryConflict } from '../../host/memory-edit';
import type { MemoryPreviewIO } from '../../host/memory-preview';
import type { MemoryFile } from '../../host/wire';
import { useDesignTheme } from '../design/theme';
import { radius, space } from '../design/tokens';
import { confirmDestructive } from '../primitives/app-dialog';
import { Button } from '../primitives/button';
import { ReadFailure } from '../primitives/read-failure';
import { SheetSaveButton } from '../primitives/sheet-save-button';
import { TextInput } from '../primitives/system-text';
import { Text } from '../primitives/text';
import { HeaderIconButton } from '../shell/header-icon-button';
import { CloseIcon, PencilIcon } from '../shell/icons';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { MemoryFileView } from './memory-file-view';

export function memoryEditable(file: MemoryFile | undefined): file is MemoryFile {
  return file !== undefined && file.binary !== true && file.image === undefined;
}

type Editing = { draft: string; base: MemoryFile };

export function MemoryFileScreen({
  title,
  load,
  save,
  role,
  preview,
}: {
  title: string;
  load: () => Promise<MemoryFile | undefined>;
  save: (body: string, expectedHead: string) => Promise<string>;
  role?: PinnedRole | undefined;
  preview?: { client: HostClient; io: MemoryPreviewIO; slug: string; path: string };
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const navigation = useNavigation();
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState<MemoryFile | undefined>();
  const [editing, setEditing] = useState<Editing>();
  const [kept, setKept] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string>();
  const dirty = editing !== undefined && editing.draft !== editing.base.body;
  const unsaved = dirty || kept !== undefined;

  const read = useCallback(async () => {
    const next = await load();
    setFile(next);
    return next;
  }, [load]);
  const askDiscard = (onDiscard: () => void) =>
    confirmDestructive(t.memoryDiscardTitle, t.memoryDiscardMessage, t.memoryDiscard, onDiscard);

  usePreventRemove(unsaved, ({ data }) =>
    askDiscard(() => navigation.dispatch(data.action as never)),
  );
  const holdDismissal = useMounted<ViewInstance>(() => {
    const parent = navigation.getParent();
    parent?.setOptions({ gestureEnabled: false });
    return () => parent?.setOptions({ gestureEnabled: true });
  }, [navigation]);

  const startEditing = (draft?: string) => {
    if (!memoryEditable(file)) return;
    setFailure(undefined);
    setKept(undefined);
    setEditing({ draft: draft ?? file.body, base: file });
  };
  const stopEditing = () => {
    if (dirty) askDiscard(() => setEditing(undefined));
    else setEditing(undefined);
  };
  const submit = async () => {
    if (editing === undefined || !dirty || saving) return;
    setSaving(true);
    setFailure(undefined);
    try {
      await save(editing.draft, editing.base.head);
      setEditing(undefined);
      setRevision((value) => value + 1);
    } catch (error) {
      if (memoryConflict(error)) {
        setKept(editing.draft);
        setEditing(undefined);
        setRevision((value) => value + 1);
      } else setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const canEdit = memoryEditable(file) && kept === undefined;
  const header = editing ? (
    <View style={{ flexDirection: 'row', gap: space.x3 }}>
      <HeaderIconButton
        label={t.memoryStopEditing}
        testID="memory-stop-editing"
        onPress={stopEditing}
      >
        <CloseIcon color={theme.color.fg} size={theme.type.title.line} />
      </HeaderIconButton>
      <SheetSaveButton
        label={t.memorySave}
        testID="memory-save"
        busy={saving}
        disabled={!dirty}
        onPress={() => void submit()}
      />
    </View>
  ) : canEdit ? (
    <HeaderIconButton
      label={t.memoryEdit(title)}
      testID="memory-edit"
      onPress={() => startEditing()}
    >
      <PencilIcon color={theme.color.fg} size={theme.type.title.line} />
    </HeaderIconButton>
  ) : null;

  return (
    <>
      <Stack.Screen
        options={
          Platform.OS === 'ios'
            ? {
                title,
                unstable_headerRightItems: () =>
                  editing
                    ? [
                        {
                          type: 'button',
                          identifier: 'memory-save',
                          label: t.memorySave,
                          icon: { type: 'sfSymbol', name: 'checkmark' },
                          variant: 'prominent',
                          tintColor: theme.color.accent,
                          disabled: !dirty || saving,
                          onPress: () => void submit(),
                        },
                        { type: 'spacing', spacing: 0 },
                        {
                          type: 'button',
                          identifier: 'memory-stop-editing',
                          label: t.memoryStopEditing,
                          icon: { type: 'sfSymbol', name: 'xmark' },
                          onPress: stopEditing,
                        },
                      ]
                    : canEdit
                      ? [
                          {
                            type: 'button',
                            identifier: 'memory-edit',
                            label: t.memoryEdit(title),
                            icon: { type: 'sfSymbol', name: 'square.and.pencil' },
                            onPress: () => startEditing(),
                          },
                        ]
                      : [],
              }
            : { title, headerRight: () => header }
        }
      />
      {editing ? (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View ref={holdDismissal} style={{ flex: 1, padding: space.x5, gap: space.x4 }}>
            {failure === undefined ? null : (
              <ReadFailure
                title={t.memorySaveFailed}
                detail={failure}
                onRetry={() => void submit()}
              />
            )}
            <TextInput
              testID="memory-editor"
              accessibilityLabel={t.memoryEditor(title)}
              value={editing.draft}
              onChangeText={(draft) => setEditing({ ...editing, draft })}
              multiline
              autoFocus
              autoCapitalize="sentences"
              textAlignVertical="top"
              scrollEnabled
              style={{
                flex: 1,
                padding: space.x4,
                borderRadius: radius.md,
                backgroundColor: theme.layer.raised.fill,
                color: theme.color.fg,
                fontSize: theme.type.body.size,
                lineHeight: theme.type.body.line,
              }}
            />
          </View>
        </KeyboardAvoidingView>
      ) : (
        <MemoryFileView
          key={revision}
          load={read}
          role={role}
          {...(preview === undefined ? {} : { preview })}
          notice={
            kept === undefined ? undefined : (
              <View
                ref={holdDismissal}
                testID="memory-conflict"
                accessibilityRole="alert"
                style={{
                  gap: space.x3,
                  padding: space.x5,
                  borderRadius: radius.md,
                  backgroundColor: theme.color.warningSoft,
                }}
              >
                <Text>{t.memoryConflict}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x3 }}>
                  <Button
                    label={t.memoryConflictEdit}
                    tone="primary"
                    testID="memory-conflict-edit"
                    disabled={!memoryEditable(file)}
                    onPress={() => startEditing(kept)}
                  />
                  <Button
                    label={t.memoryConflictDiscard}
                    variant="text"
                    testID="memory-conflict-discard"
                    onPress={() => setKept(undefined)}
                  />
                </View>
              </View>
            )
          }
        />
      )}
    </>
  );
}
