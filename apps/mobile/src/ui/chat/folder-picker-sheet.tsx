import { useState } from 'react';
import { ScrollView, SectionList, View, type ViewInstance } from 'react-native';

import {
  errorText,
  folderBrowsingUnavailable,
  type HostFolder,
  type HostFolderListing,
  type Loadable,
  type WorkspaceOption,
} from '@botharness/host-client/bot-settings';
import { useMounted } from '../mounted';
import { Button } from '../primitives/button';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { TextField } from '../primitives/text-field';
import { useStrings } from '../strings';
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
import { NewFolderPage, type CreateFolder } from './new-folder-page';
import { Crumbs, Grouped, locationSection } from './workspace-sheet';

export interface FolderPickerPort {
  listFolders(path?: string): Promise<HostFolderListing>;
  loadWorkspaceOptions(): Promise<WorkspaceOption[]>;
  resolveFolder(path: string): Promise<WorkspaceOption>;
  createFolder?: CreateFolder | undefined;
}

type Row =
  | { kind: 'registered'; key: string; option: WorkspaceOption }
  | { kind: 'folder'; key: string; folder: HostFolder }
  | { kind: 'new-folder'; key: string }
  | { kind: 'loading'; key: string }
  | { kind: 'empty'; key: string; text: string; tone?: 'warning' };

export type PickedFolder = { path: string; title: string; workspaceId?: string };

export type FolderPick = {
  title: string;
  subtitle: string;
  heading: string;
  target(path: string): string;
  confirm: string;
  onPick(folder: PickedFolder): void;
};

function folderTitle(path: string): string {
  return path.split(/[\\/]/u).findLast((part) => part !== '') ?? path;
}

export function FolderPickerSheet({
  botName = '',
  port,
  pick,
  onConfirm,
  onClose,
}: {
  botName?: string;
  port: FolderPickerPort;
  pick?: FolderPick;
  onConfirm?(folder: WorkspaceOption): Promise<void>;
  onClose(): void;
}) {
  const t = useStrings();
  const [listing, setListing] = useState<Loadable<HostFolderListing>>({ status: 'loading' });
  const [options, setOptions] = useState<WorkspaceOption[]>([]);
  const [chosen, setChosen] = useState<WorkspaceOption>();
  const [busy, setBusy] = useState<'resolve' | 'confirm'>();
  const [error, setError] = useState<string>();
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');
  const [naming, setNaming] = useState(false);
  const [creating, setCreating] = useState(false);

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
    if (busy === undefined && !creating) onClose();
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
        fill
        label={t.grantConfirm(botName)}
        title={t.grantConfirm(botName)}
        onClose={close}
      >
        {start}
        <ScrollView nestedScrollEnabled testID="grant-confirm-scroll" style={{ flexShrink: 1 }}>
          {notice}
          <SettingsGroupItem first last on={SHEET_GROUP}>
            <SettingsRow
              title={chosen.title}
              detail={chosen.path}
              icon="folder"
              iconTone="muted"
              on={SHEET_GROUP}
            />
          </SettingsGroupItem>
          <SheetFooter>{t.grantScopeNote}</SheetFooter>
        </ScrollView>
        <SheetActions>
          <Button
            label={t.back}
            on="sheet"
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
            on="sheet"
            busy={busy === 'confirm'}
            disabled={busy !== undefined}
            onPress={() => run('confirm', () => onConfirm?.(chosen) ?? Promise.resolve())}
          />
        </SheetActions>
      </Sheet>
    );

  if (naming && listing.status === 'ready' && port.createFolder !== undefined)
    return (
      <Sheet visible fill avoidKeyboard label={t.newFolder} title={t.newFolder} onClose={close}>
        {start}
        <NewFolderPage
          parent={{
            path: listing.value.path,
            name: listing.value.crumbs.at(-1)?.name ?? folderTitle(listing.value.path),
          }}
          create={port.createFolder}
          onBusy={setCreating}
          onBack={() => setNaming(false)}
          onCreated={(workspace) => {
            setNaming(false);
            setOptions((current) => [
              workspace,
              ...current.filter((option) => option.id !== workspace.id),
            ]);
            if (pick !== undefined)
              pick.onPick({
                path: workspace.path,
                title: workspace.title,
                workspaceId: workspace.id,
              });
            else setChosen(workspace);
          }}
        />
      </Sheet>
    );

  const choose = (path: string) => {
    if (pick !== undefined) {
      pick.onPick({ path, title: folderTitle(path) });
      return;
    }
    run('resolve', async () => {
      setChosen(await port.resolveFolder(path));
    });
  };

  const folders =
    listing.status === 'ready' ? listing.value.entries.filter((entry) => !entry.hidden) : [];
  const folderRows: Row[] =
    listing.status === 'loading'
      ? [{ kind: 'loading', key: 'loading' }]
      : listing.status === 'failed'
        ? [{ kind: 'empty', key: 'failed', text: listing.error, tone: 'warning' }]
        : [
            ...(port.createFolder === undefined
              ? []
              : [{ kind: 'new-folder', key: 'new-folder' } as const]),
            ...(folders.length === 0
              ? [{ kind: 'empty', key: 'empty', text: t.browseEmpty } as const]
              : folders.map((folder) => ({
                  kind: 'folder' as const,
                  key: `folder:${folder.path}`,
                  folder,
                }))),
          ];
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
      title: pick?.heading ?? t.browseTitle,
      footer: listing.status === 'ready' && listing.value.truncated ? t.browseTruncated : undefined,
      data: folderRows,
    },
    ...(listing.status === 'ready' ? locationSection(listing.value) : []),
  ];
  return (
    <Sheet
      visible
      fill
      label={pick?.title ?? t.browseTitle}
      title={pick?.title ?? t.grantTitle}
      subtitle={pick?.subtitle ?? t.browseHint}
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
        nestedScrollEnabled
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
            ) : item.kind === 'new-folder' ? (
              <SettingsRow
                testID="folder-picker-new-folder"
                title={t.newFolder}
                icon="newFolder"
                on={SHEET_GROUP}
                onPress={busy === undefined ? () => setNaming(true) : undefined}
              />
            ) : item.kind === 'registered' ? (
              <SettingsRow
                title={item.option.title}
                detail={item.option.path}
                icon="folder"
                iconTone="muted"
                on={SHEET_GROUP}
                onPress={
                  busy !== undefined
                    ? undefined
                    : pick !== undefined
                      ? () =>
                          pick.onPick({
                            path: item.option.path,
                            title: item.option.title,
                            workspaceId: item.option.id,
                          })
                      : () => choose(item.option.path)
                }
              />
            ) : (
              <SettingsRow
                title={item.folder.name}
                icon="folder"
                iconTone="muted"
                control={{ kind: 'chevron' }}
                on={SHEET_GROUP}
                onPress={busy === undefined ? () => browse(item.folder.path) : undefined}
              />
            )}
          </Grouped>
        )}
      />
      {!manual && pick !== undefined && listing.status === 'ready' ? (
        <SheetNote>{pick.target(listing.value.path)}</SheetNote>
      ) : null}
      <SheetActions>
        <Button label={t.cancel} on="sheet" disabled={busy !== undefined} onPress={close} />
        <Button
          label={pick?.confirm ?? t.authorizeHere}
          testID="grant-choose-here"
          tone="primary"
          on="sheet"
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
