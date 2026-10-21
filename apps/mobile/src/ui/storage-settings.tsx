import { useCallback, useState } from 'react';
import { ScrollView, View, type ScrollViewInstance } from 'react-native';

import { MethodRefused } from '../host/client';
import {
  STORAGE_AGES,
  STORAGE_MEDIA_KINDS,
  storageCutoff,
  storageSize,
  type StorageAge,
  type StorageCleanupPreview,
  type StorageCleanupResult,
  type StorageCleanupScope,
  type StorageMediaKind,
  type StorageMessagesPreview,
  type StorageMessagesResult,
  type StoragePartKind,
  type StorageUsage,
} from '../host/storage';
import { chart } from './design/chart';
import { radius, space } from './design/tokens';
import { useDesignTheme } from './design/theme';
import { useMounted } from './mounted';
import { confirmDestructive, showAppDialog } from './primitives/app-dialog';
import { RowIcon } from './primitives/row-icon';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { Toggle } from './primitives/toggle';
import { ActionButton, LoadFailed, Loading, Notice, errorText } from './request-parts';
import { CheckIcon } from './shell/icons';
import { t } from './strings';

export interface StorageSettingsPort {
  usage(): Promise<StorageUsage>;
  preview(scope: StorageCleanupScope): Promise<StorageCleanupPreview>;
  confirm(preview: StorageCleanupPreview): Promise<StorageCleanupResult>;
  previewMessages(scope: {
    before: string;
    channelIds?: string[];
  }): Promise<StorageMessagesPreview>;
  confirmMessages(preview: StorageMessagesPreview): Promise<StorageMessagesResult>;
  clearImageCache(): Promise<void>;
}

type Target = 'media' | 'messages';
const TARGETS: readonly Target[] = ['media', 'messages'];

const SHADE: Record<StoragePartKind, number> = { media: 1, messages: 0.62, memory: 0.36, other: 0 };

function failure(error: unknown): string {
  return error instanceof MethodRefused && error.code === 'storage-preview-stale'
    ? t.storage.stale
    : `${t.storage.failed} ${errorText(error)}`;
}

export function StorageSettings({ port }: { port: StorageSettingsPort }) {
  const theme = useDesignTheme();
  const [usage, setUsage] = useState<StorageUsage>();
  const [loadError, setLoadError] = useState<string>();
  const [target, setTarget] = useState<Target>('media');
  const [age, setAge] = useState<StorageAge>('90');
  const [kinds, setKinds] = useState<StorageMediaKind[]>([...STORAGE_MEDIA_KINDS]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string }>();

  const load = useCallback(() => {
    setLoadError(undefined);
    port.usage().then(setUsage, (reason: unknown) => setLoadError(errorText(reason)));
  }, [port]);
  const mount = useMounted<ScrollViewInstance>(() => load(), [load]);

  const messagesTarget = target === 'messages';
  const chats =
    usage?.chats.filter((chat) => (messagesTarget ? chat.messages > 0 : chat.mediaBytes > 0)) ?? [];
  const selected = chats.filter((chat) => !excluded.includes(chat.channelId));
  const ready = selected.length > 0 && (messagesTarget || kinds.length > 0);

  const failed = (reason: unknown) => {
    setBusy(false);
    setNotice({ tone: 'danger', text: failure(reason) });
  };

  const settle = (work: Promise<string>) => {
    setBusy(true);
    work.then((text) => {
      setBusy(false);
      setNotice({ tone: 'success', text });
      load();
    }, failed);
  };

  const reviewMessages = (scope: { before: string; channelIds?: string[] }) => {
    port.previewMessages(scope).then((preview) => {
      setBusy(false);
      const notes = [
        ...(preview.files === 0 ? [] : [t.storage.messages.files(preview.files)]),
        ...(preview.memoryReferences === 0
          ? []
          : [t.storage.messages.memory(preview.memoryReferences)]),
        ...preview.kept.map((kept) => t.storage.messages.kept[kept.reason](kept.messages)),
        ...(preview.more ? [t.storage.messages.more] : []),
      ];
      if (preview.messages === 0) {
        showAppDialog(
          t.storage.messages.heading,
          [t.storage.messages.nothing, ...notes].join('\n\n'),
          [{ text: t.done }],
        );
        return;
      }
      confirmDestructive(
        t.storage.messages.confirmTitle,
        [
          t.storage.messages.lead(
            preview.messages,
            preview.chats.length,
            storageSize(preview.bytes),
          ),
          t.storage.messages.note,
          ...notes,
        ].join('\n\n'),
        t.storage.messages.confirm,
        () =>
          settle(
            port
              .confirmMessages(preview)
              .then((result) =>
                t.storage.messages.done(result.messages, storageSize(result.freedBytes)),
              ),
          ),
      );
    }, failed);
  };

  const review = () => {
    if (busy || !ready) return;
    setBusy(true);
    setNotice(undefined);
    const scope = {
      before: storageCutoff(age),
      ...(selected.length === chats.length
        ? {}
        : { channelIds: selected.map((chat) => chat.channelId) }),
    };
    if (messagesTarget) {
      reviewMessages(scope);
      return;
    }
    port.preview({ ...scope, kinds }).then((preview) => {
      setBusy(false);
      const notes = [
        ...(preview.freedBytes < preview.bytes ? [t.storage.shared] : []),
        ...preview.kept.map((kept) => t.storage.kept[kept.reason](kept.files)),
      ];
      if (preview.files === 0) {
        showAppDialog(t.storage.clearHeading, [t.storage.nothing, ...notes].join('\n\n'), [
          { text: t.done },
        ]);
        return;
      }
      confirmDestructive(
        t.storage.confirmTitle,
        [
          t.storage.confirmLead(preview.files, preview.messages, storageSize(preview.freedBytes)),
          t.storage.textKept,
          ...notes,
        ].join('\n\n'),
        t.storage.confirm,
        () =>
          settle(
            port
              .confirm(preview)
              .then((result) => t.storage.done(result.files, storageSize(result.freedBytes))),
          ),
      );
    }, failed);
  };

  const clearImageCache = () => {
    port.clearImageCache().then(
      () => setNotice({ tone: 'success', text: t.storage.imageCacheDone }),
      (reason: unknown) => setNotice({ tone: 'danger', text: errorText(reason) }),
    );
  };

  return (
    <ScrollView
      ref={mount}
      nestedScrollEnabled
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: theme.overlay.fill }}
      contentContainerStyle={{ padding: space.x5, gap: space.x6 }}
    >
      {loadError !== undefined ? <LoadFailed error={loadError} onRetry={load} /> : null}
      {usage === undefined && loadError === undefined ? <Loading /> : null}
      {usage === undefined ? null : (
        <View style={{ gap: space.x4 }}>
          <Text variant="display" accessibilityRole="header">
            {t.storage.total(storageSize(usage.totalBytes))}
          </Text>
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              flexDirection: 'row',
              height: chart.bar / 2,
              borderRadius: radius.round,
              overflow: 'hidden',
              backgroundColor: theme.layer.raised.inset,
            }}
          >
            {usage.parts.map((part) =>
              part.bytes === 0 || usage.totalBytes === 0 ? null : (
                <View
                  key={part.kind}
                  style={{
                    flexGrow: part.bytes,
                    flexBasis: 0,
                    minWidth: chart.stub,
                    backgroundColor:
                      part.kind === 'other' ? theme.color.borderStrong : theme.color.accent,
                    opacity: part.kind === 'other' ? 1 : SHADE[part.kind],
                  }}
                />
              ),
            )}
          </View>
          <SettingsSection on="raised">
            {usage.parts.map((part) => (
              <SettingsRow
                on="raised"
                key={part.kind}
                title={t.storage.part[part.kind]}
                leading={
                  <View
                    style={{
                      width: space.x3,
                      height: space.x3,
                      borderRadius: radius.round,
                      backgroundColor:
                        part.kind === 'other' ? theme.color.borderStrong : theme.color.accent,
                      opacity: part.kind === 'other' ? 1 : SHADE[part.kind],
                    }}
                  />
                }
                trailing={
                  <Text tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                    {storageSize(part.bytes)}
                  </Text>
                }
              />
            ))}
          </SettingsSection>
        </View>
      )}
      {notice === undefined ? null : <Notice tone={notice.tone}>{notice.text}</Notice>}
      {usage === undefined ? null : (
        <View style={{ gap: space.x5 }}>
          <View style={{ gap: space.x2 }}>
            <Text variant="title" accessibilityRole="header">
              {messagesTarget ? t.storage.messages.heading : t.storage.clearHeading}
            </Text>
            <Text variant="meta" tone="muted">
              {messagesTarget ? t.storage.messages.note : t.storage.textKept}
            </Text>
          </View>
          <SettingsSection on="raised" title={t.storage.target}>
            {TARGETS.map((choice) => (
              <SettingsRow
                on="raised"
                key={choice}
                title={choice === 'media' ? t.storage.targetMedia : t.storage.targetMessages}
                selected={target === choice}
                trailing={
                  target === choice ? (
                    <CheckIcon size={space.x5} color={theme.color.accent} />
                  ) : undefined
                }
                onPress={() => setTarget(choice)}
              />
            ))}
          </SettingsSection>
          {chats.length === 0 ? (
            <Text tone="muted">{messagesTarget ? t.storage.messages.none : t.storage.noMedia}</Text>
          ) : (
            <>
              <SettingsSection on="raised" title={t.storage.olderThan}>
                {STORAGE_AGES.map((choice) => (
                  <SettingsRow
                    on="raised"
                    key={choice}
                    title={t.storage.age[choice]}
                    selected={age === choice}
                    trailing={
                      age === choice ? (
                        <CheckIcon size={space.x5} color={theme.color.accent} />
                      ) : undefined
                    }
                    onPress={() => setAge(choice)}
                  />
                ))}
              </SettingsSection>
              {messagesTarget ? null : (
                <SettingsSection on="raised" title={t.storage.kinds}>
                  {STORAGE_MEDIA_KINDS.map((kind) => (
                    <SettingsRow
                      on="raised"
                      key={kind}
                      title={t.storage.kind[kind]}
                      trailing={
                        <Toggle
                          on="raised"
                          label={t.storage.kind[kind]}
                          value={kinds.includes(kind)}
                          onChange={(enabled) =>
                            setKinds((current) =>
                              STORAGE_MEDIA_KINDS.filter((item) =>
                                item === kind ? enabled : current.includes(item),
                              ),
                            )
                          }
                        />
                      }
                    />
                  ))}
                </SettingsSection>
              )}
              <SettingsSection on="raised" title={t.storage.chats}>
                {chats.map((chat) => {
                  const name = chat.deleted === true ? t.storage.deleted(chat.name) : chat.name;
                  return (
                    <SettingsRow
                      on="raised"
                      key={chat.channelId}
                      title={name}
                      detail={
                        messagesTarget
                          ? t.storage.messages.count(chat.messages)
                          : storageSize(chat.mediaBytes)
                      }
                      trailing={
                        <Toggle
                          on="raised"
                          label={name}
                          value={!excluded.includes(chat.channelId)}
                          onChange={(enabled) =>
                            setExcluded((current) =>
                              enabled
                                ? current.filter((id) => id !== chat.channelId)
                                : [...current, chat.channelId],
                            )
                          }
                        />
                      }
                    />
                  );
                })}
              </SettingsSection>
              <View style={{ flexDirection: 'row' }}>
                <ActionButton
                  label={t.storage.clear}
                  tone="danger"
                  busy={busy}
                  disabled={!ready}
                  onPress={review}
                />
              </View>
            </>
          )}
        </View>
      )}
      <SettingsSection on="raised" title={t.storage.phone} footer={t.storage.imageCacheHint}>
        <SettingsRow
          on="raised"
          title={t.storage.imageCache}
          leading={<RowIcon name="background" color={theme.color.accent} />}
          tone="accent"
          onPress={clearImageCache}
        />
      </SettingsSection>
    </ScrollView>
  );
}
