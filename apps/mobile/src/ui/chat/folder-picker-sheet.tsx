import { useState } from 'react';
import { ScrollView, SectionList, View, type ViewInstance } from 'react-native';

import {
  errorText,
  folderBrowsingUnavailable,
  type HostFolder,
  type HostFolderListing,
  type Loadable,
  type WorkspaceOption,
} from '../../host/bot-settings';
import { useDesignTheme } from '../design/theme';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { TextField } from '../primitives/text-field';
import { ChevronRightIcon } from '../shell/icons';
import { t } from '../strings';
import {
  Sheet,
  SheetActions,
  SheetCallout,
  SheetFooter,
  SheetHeading,
  SheetLoading,
  SheetNote,
  SHEET_GROUP,
} from './sheet';
import { Crumbs, Grouped, locationSection, RowIcon } from './workspace-sheet';

export interface FolderPickerPort {
  listFolders(path?: string): Promise<HostFolderListing>;
  loadWorkspaceOptions(): Promise<WorkspaceOption[]>;
  resolveFolder(path: string): Promise<WorkspaceOption>;
}

type Row =
  | { kind: 'registered'; key: string; option: WorkspaceOption }
  | { kind: 'folder'; key: string; folder: HostFolder }
  | { kind: 'loading'; key: string }
  | { kind: 'empty'; key: string; text: string; tone?: 'warning' };

export function FolderPickerSheet({
  botName,
  port,
  onConfirm,
  onClose,
}: {
  botName: string;
  port: FolderPickerPort;
  onConfirm(folder: WorkspaceOption): Promise<void>;
  onClose(): void;
}) {
  const theme = useDesignTheme();
  const [listing, setListing] = useState<Loadable<HostFolderListing>>({ status: 'loading' });
  const [options, setOptions] = useState<WorkspaceOption[]>([]);
  const [chosen, setChosen] = useState<WorkspaceOption>();
  const [busy, setBusy] = useState<'resolve' | 'confirm'>();
  const [error, setError] = useState<string>();
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');

  const browse = (path?: string) => {
    setListing({ status: 'loading' });
    void port.listFolders(path).then(
      (value) => setListing({ status: 'ready', value }),
      (cause: unknown) => {
        const unavailable = folderBrowsingUnavailable(cause);
        setManual(unavailable);
        setListing({
          status: 'failed',
          error: unavailable ? t.browseUnavailableTypePath : errorText(cause),
        });
      },
    );
  };

  const mount = useMounted<ViewInstance>(() => {
    void port.loadWorkspaceOptions().then(setOptions, () => undefined);
    browse();
  }, [port]);

  const run = (key: 'resolve' | 'confirm', work: () => Promise<void>) => {
    if (busy !== undefined) return;
    setBusy(key);
    setError(undefined);
    void work()
      .catch((cause: unknown) => setError(`${t.decideFailed} ${errorText(cause)}`))
      .finally(() => setBusy(undefined));
  };

  const close = () => {
    if (busy === undefined) onClose();
  };

  const start = <View ref={mount} />;
  const notice = (
    <>
      {busy === undefined ? null : <SheetNote>{t.workspaceWorking}</SheetNote>}
      {error === undefined ? null : <SheetCallout tone="danger">{error}</SheetCallout>}
    </>
  );

  if (chosen !== undefined)
    return (
      <Sheet
        visible
        label={t.grantConfirm(botName)}
        title={t.grantConfirm(botName)}
        onClose={close}
      >
        {start}
        <ScrollView testID="grant-confirm-scroll" style={{ flexShrink: 1 }}>
          {notice}
          <SettingsGroupItem first last on={SHEET_GROUP}>
            <SettingsRow
              title={chosen.title}
              detail={chosen.path}
              leading={<RowIcon kind="folder" />}
              on={SHEET_GROUP}
            />
          </SettingsGroupItem>
          <SheetFooter>{t.grantScopeNote}</SheetFooter>
        </ScrollView>
        <SheetActions>
          <Button
            label={t.back}
            on="canvas"
            disabled={busy !== undefined}
            onPress={() => {
              setError(undefined);
              setChosen(undefined);
            }}
          />
          <Button
            label={t.grantAllow}
            testID="grant-allow-read-write"
            tone="primary"
            on="canvas"
            busy={busy === 'confirm'}
            disabled={busy !== undefined}
            onPress={() => run('confirm', () => onConfirm(chosen))}
          />
        </SheetActions>
      </Sheet>
    );

  const choose = (path: string) =>
    run('resolve', async () => {
      setChosen(await port.resolveFolder(path));
    });

  const folders =
    listing.status === 'ready' ? listing.value.entries.filter((entry) => !entry.hidden) : [];
  const folderRows: Row[] =
    listing.status === 'loading'
      ? [{ kind: 'loading', key: 'loading' }]
      : listing.status === 'failed'
        ? [{ kind: 'empty', key: 'failed', text: listing.error, tone: 'warning' }]
        : folders.length === 0
          ? [{ kind: 'empty', key: 'empty', text: t.browseEmpty }]
          : folders.map((folder) => ({ kind: 'folder', key: `folder:${folder.path}`, folder }));
  const sections = [
    ...(options.length === 0
      ? []
      : [
          {
            key: 'registered',
            title: t.registeredFolders,
            data: options.map((option): Row => ({
              kind: 'registered',
              key: `option:${option.id}`,
              option,
            })),
          },
        ]),
    {
      key: 'folders',
      title: t.browseTitle,
      footer: listing.status === 'ready' && listing.value.truncated ? t.browseTruncated : undefined,
      data: folderRows,
    },
    ...(listing.status === 'ready' ? locationSection(listing.value) : []),
  ];
  return (
    <Sheet
      visible
      label={t.browseTitle}
      title={t.grantTitle}
      subtitle={t.browseHint}
      onClose={close}
    >
      {start}
      {manual ? (
        <TextField
          accessibilityLabel={t.folderPath}
          testID="grant-folder-path"
          placeholder={t.folderPathHint}
          autoCapitalize="none"
          autoCorrect={false}
          editable={busy === undefined}
          value={typed}
          onChangeText={setTyped}
        />
      ) : null}
      {listing.status === 'ready' ? (
        <Crumbs
          crumbs={listing.value.crumbs}
          disabled={busy !== undefined}
          onOpen={(path) => browse(path)}
        />
      ) : null}
      <SectionList<
        Row,
        { key: string; title: string; footer?: string | undefined; data: readonly Row[] }
      >
        style={{ flexShrink: 1 }}
        sections={sections}
        keyExtractor={(row) => row.key}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={notice}
        renderSectionHeader={({ section }) => <SheetHeading>{section.title}</SheetHeading>}
        renderSectionFooter={({ section }) =>
          section.footer === undefined ? null : <SheetFooter>{section.footer}</SheetFooter>
        }
        renderItem={({ item, index, section }) => (
          <Grouped index={index} count={section.data.length}>
            {item.kind === 'loading' ? (
              <SheetLoading />
            ) : item.kind === 'empty' ? (
              <SettingsRow
                title={item.text}
                tone={item.tone === 'warning' ? 'warning' : 'muted'}
                on={SHEET_GROUP}
              />
            ) : item.kind === 'registered' ? (
              <SettingsRow
                title={item.option.title}
                detail={item.option.path}
                leading={<RowIcon kind="folder" />}
                on={SHEET_GROUP}
                onPress={busy === undefined ? () => choose(item.option.path) : undefined}
              />
            ) : (
              <SettingsRow
                title={item.folder.name}
                leading={<RowIcon kind="folder" />}
                trailing={
                  <ChevronRightIcon color={theme.color.subtle} size={theme.type.meta.line} />
                }
                on={SHEET_GROUP}
                onPress={busy === undefined ? () => browse(item.folder.path) : undefined}
              />
            )}
          </Grouped>
        )}
      />
      <SheetActions>
        <Button label={t.cancel} on="canvas" disabled={busy !== undefined} onPress={close} />
        <Button
          label={t.authorizeHere}
          testID="grant-choose-here"
          tone="primary"
          on="canvas"
          busy={busy === 'resolve'}
          disabled={
            busy !== undefined || (manual ? typed.trim() === '' : listing.status !== 'ready')
          }
          onPress={() => {
            if (manual) choose(typed.trim());
            else if (listing.status === 'ready') choose(listing.value.path);
          }}
        />
      </SheetActions>
    </Sheet>
  );
}
