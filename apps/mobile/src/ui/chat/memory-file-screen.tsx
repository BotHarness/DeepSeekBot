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
import { SplitButton } from '../primitives/split-button';
import { TextInput } from '../primitives/system-text';
import { Text } from '../primitives/text';
import { HeaderIconButton } from '../shell/header-icon-button';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { MemoryFileView } from './memory-file-view';
import { copyMessage } from './message-menu';

const paths = {
  edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
  copy: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
  history:
    'M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z',
} as const;

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
  onHistory,
}: {
  title: string;
  load: () => Promise<MemoryFile | undefined>;
  save: (body: string, expectedHead: string) => Promise<string>;
  role?: PinnedRole | undefined;
  preview?: { client: HostClient; io: MemoryPreviewIO; slug: string; path: string };
  onHistory?: (() => void) | undefined;
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
  const copyable = memoryEditable(file);
  const more = [
    ...(copyable ? [{ key: 'copy', label: t.memoryCopy, path: paths.copy }] : []),
    ...(onHistory === undefined
      ? []
      : [{ key: 'history', label: t.memoryHistory, path: paths.history }]),
  ];
  const pickMore = (key: string) => {
    if (key === 'copy' && copyable) copyMessage(file.body);
    if (key === 'history') onHistory?.();
  };
  const header = editing ? (
    <View style={{ flexDirection: 'row', gap: space.x3 }}>
      <HeaderIconButton
        icon="close"
        label={t.memoryStopEditing}
        testID="memory-stop-editing"
        onPress={stopEditing}
      />
      <SheetSaveButton
        label={t.memorySave}
        testID="memory-save"
        busy={saving}
        disabled={!dirty}
        onPress={() => void submit()}
      />
    </View>
  ) : canEdit && Platform.OS === 'android' ? (
    <SplitButton
      testID="memory-edit"
      label={t.memoryEditShort}
      path={paths.edit}
      menuLabel={t.memoryMore(title)}
      items={more}
      onPress={() => startEditing()}
      onPick={pickMore}
    />
  ) : canEdit ? (
    <HeaderIconButton
      icon="edit"
      label={t.memoryEdit(title)}
      testID="memory-edit"
      onPress={() => startEditing()}
    />
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
                    : [
                        ...(canEdit
                          ? [
                              {
                                type: 'button' as const,
                                identifier: 'memory-edit',
                                label: t.memoryEdit(title),
                                icon: {
                                  type: 'sfSymbol' as const,
                                  name: 'square.and.pencil' as const,
                                },
                                onPress: () => startEditing(),
                              },
                            ]
                          : []),
                        ...(more.length === 0
                          ? []
                          : [
                              {
                                type: 'menu' as const,
                                identifier: 'memory-more',
                                label: t.memoryMore(title),
                                icon: { type: 'sfSymbol' as const, name: 'ellipsis' as const },
                                menu: {
                                  items: more.map((item) => ({
                                    type: 'action' as const,
                                    label: item.label,
                                    icon: {
                                      type: 'sfSymbol' as const,
                                      name:
                                        item.key === 'copy'
                                          ? ('doc.on.doc' as const)
                                          : ('clock.arrow.circlepath' as const),
                                    },
                                    onPress: () => pickMore(item.key),
                                  })),
                                },
                              },
                            ]),
                      ],
              }
            : { title, headerRight: () => header }
        }
      />
      {editing ? (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View ref={holdDismissal} style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
            {failure === undefined ? null : (
              <View style={{ paddingHorizontal: space.x5, paddingTop: space.x4 }}>
                <ReadFailure
                  title={t.memorySaveFailed}
                  detail={failure}
                  onRetry={() => void submit()}
                />
              </View>
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
                paddingHorizontal: space.x5,
                paddingVertical: space.x4,
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
