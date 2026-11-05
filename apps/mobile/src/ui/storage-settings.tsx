import { useCallback, useState } from 'react';
import { View, type ViewInstance } from 'react-native';

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
import { PreferenceRow } from './primitives/preference-row';
import { SettingsForm, SettingsFormItem } from './primitives/settings-form';
import { SettingsRow, SettingsSection } from './primitives/settings-row';
import { Text } from './primitives/text';
import { LoadFailed, Loading, Notice, errorText } from './request-parts';
import { useStrings, t } from './strings';

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
  phone?: PhoneStoragePort;
}

export interface PhoneStoragePort {
  usage(): number;
  previewOlder(days: number): { files: number; bytes: number };
  clearOlder(days: number): { files: number; bytes: number };
  autoCleanup(): boolean;
  setAutoCleanup(enabled: boolean): void;
}

const PHONE_AGES = ['30', '90', '180', '365'] as const;

type Target = 'media' | 'messages';
const TARGETS: readonly Target[] = ['media', 'messages'];

const SHADE: Record<StoragePartKind, number> = { media: 1, messages: 0.62, memory: 0.36, other: 0 };

function failure(error: unknown): string {
  return error instanceof MethodRefused && error.code === 'storage-preview-stale'
    ? t.storage.stale
    : `${t.storage.failed} ${errorText(error)}`;
}

export function StorageSettings({ port }: { port: StorageSettingsPort }) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [usage, setUsage] = useState<StorageUsage>();
  const [loadError, setLoadError] = useState<string>();
  const [target, setTarget] = useState<Target>('media');
  const [age, setAge] = useState<StorageAge>('90');
  const [kinds, setKinds] = useState<StorageMediaKind[]>([...STORAGE_MEDIA_KINDS]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string }>();
  const [phoneBytes, setPhoneBytes] = useState(() => port.phone?.usage());
  const [phoneAge, setPhoneAge] = useState<(typeof PHONE_AGES)[number]>('90');
  const [autoCleanup, setAutoCleanupState] = useState(() => port.phone?.autoCleanup() ?? false);

  const load = useCallback(() => {
    setLoadError(undefined);
    port.usage().then(setUsage, (reason: unknown) => setLoadError(errorText(reason)));
  }, [port]);
  const mount = useMounted<ViewInstance>(() => load(), [load]);

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

  const clearImageCache = () =>
    confirmDestructive(
      t.storage.imageCacheConfirmTitle,
      t.storage.imageCacheConfirmBody,
      t.storage.imageCacheConfirm,
      runClearImageCache,
    );
  const runClearImageCache = () => {
    port.clearImageCache().then(
      () => {
        setNotice({ tone: 'success', text: t.storage.imageCacheDone });
        setPhoneBytes(port.phone?.usage());
      },
      (reason: unknown) => setNotice({ tone: 'danger', text: errorText(reason) }),
    );
  };
  const clearPhoneOlder = (days: number) => {
    const phone = port.phone;
    if (phone === undefined) return;
    const preview = phone.previewOlder(days);
    if (preview.files === 0) {
      showAppDialog(t.storage.phoneOlder, t.storage.phoneOlderNothing, [{ text: t.done }]);
      return;
    }
    confirmDestructive(
      t.storage.phoneOlderTitle,
      t.storage.phoneOlderLead(preview.files, storageSize(preview.bytes)),
      t.storage.phoneOlderConfirm,
      () => {
        const result = phone.clearOlder(days);
        setNotice({
          tone: 'success',
          text: t.storage.phoneOlderDone(result.files, storageSize(result.bytes)),
        });
        setPhoneBytes(phone.usage());
      },
    );
  };

  return (
    <View ref={mount} style={{ flex: 1 }}>
      <SettingsForm testID="storage-settings">
        {loadError !== undefined ? (
          <SettingsFormItem>
            <LoadFailed error={loadError} onRetry={load} />
          </SettingsFormItem>
        ) : null}
        {usage === undefined && loadError === undefined ? (
          <SettingsFormItem>
            <Loading />
          </SettingsFormItem>
        ) : null}
        {usage === undefined ? null : (
          <SettingsFormItem>
            <View style={{ gap: space.x4, paddingHorizontal: space.x5, paddingVertical: space.x3 }}>
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
            </View>
          </SettingsFormItem>
        )}
        {usage === undefined ? null : (
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
                control={{ kind: 'value', text: storageSize(part.bytes) }}
              />
            ))}
          </SettingsSection>
        )}
        {notice === undefined ? null : (
          <SettingsFormItem>
            <Notice tone={notice.tone}>{notice.text}</Notice>
          </SettingsFormItem>
        )}
        {usage === undefined ? null : (
          <SettingsSection
            on="raised"
            title={messagesTarget ? t.storage.messages.heading : t.storage.clearHeading}
            footer={messagesTarget ? t.storage.messages.note : t.storage.textKept}
          >
            {TARGETS.map((choice) => (
              <SettingsRow
                on="raised"
                key={choice}
                title={choice === 'media' ? t.storage.targetMedia : t.storage.targetMessages}
                selected={target === choice}
                control={target === choice ? { kind: 'check' } : undefined}
                onPress={() => setTarget(choice)}
              />
            ))}
          </SettingsSection>
        )}
        {usage !== undefined && chats.length === 0 ? (
          <SettingsSection on="raised">
            <SettingsRow
              on="raised"
              title={messagesTarget ? t.storage.messages.none : t.storage.noMedia}
            />
          </SettingsSection>
        ) : null}
        {usage === undefined || chats.length === 0 ? null : (
          <SettingsSection on="raised" title={t.storage.olderThan}>
            {STORAGE_AGES.map((choice) => (
              <SettingsRow
                on="raised"
                key={choice}
                title={t.storage.age[choice]}
                selected={age === choice}
                control={age === choice ? { kind: 'check' } : undefined}
                onPress={() => setAge(choice)}
              />
            ))}
          </SettingsSection>
        )}
        {usage === undefined || chats.length === 0 || messagesTarget ? null : (
          <SettingsSection on="raised" title={t.storage.kinds}>
            {STORAGE_MEDIA_KINDS.map((kind) => (
              <SettingsRow
                on="raised"
                key={kind}
                title={t.storage.kind[kind]}
                control={{
                  kind: 'switch',
                  value: kinds.includes(kind),
                  onChange: (enabled) =>
                    setKinds((current) =>
                      STORAGE_MEDIA_KINDS.filter((item) =>
                        item === kind ? enabled : current.includes(item),
                      ),
                    ),
                }}
              />
            ))}
          </SettingsSection>
        )}
        {usage === undefined || chats.length === 0 ? null : (
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
                  control={{
                    kind: 'switch',
                    value: !excluded.includes(chat.channelId),
                    onChange: (enabled) =>
                      setExcluded((current) =>
                        enabled
                          ? current.filter((id) => id !== chat.channelId)
                          : [...current, chat.channelId],
                      ),
                  }}
                />
              );
            })}
          </SettingsSection>
        )}
        {usage === undefined || chats.length === 0 ? null : (
          <SettingsSection on="raised">
            <SettingsRow
              on="raised"
              testID="storage-clear"
              title={t.storage.clear}
              tone="danger"
              {...(busy ? { control: { kind: 'busy' } as const } : {})}
              {...(busy || !ready ? {} : { onPress: review })}
            />
          </SettingsSection>
        )}
        <SettingsSection
          on="raised"
          title={t.storage.phone}
          footer={port.phone === undefined ? t.storage.imageCacheHint : t.storage.phoneAutoHint}
        >
          {phoneBytes === undefined ? null : (
            <SettingsRow
              on="raised"
              title={t.storage.phoneSaved}
              control={{ kind: 'value', text: storageSize(phoneBytes) }}
            />
          )}
          {port.phone === undefined ? null : (
            <SettingsRow
              on="raised"
              title={t.storage.phoneAuto}
              control={{
                kind: 'switch',
                testID: 'storage-phone-auto-cleanup',
                value: autoCleanup,
                onChange: (enabled) => {
                  port.phone?.setAutoCleanup(enabled);
                  setAutoCleanupState(enabled);
                },
              }}
            />
          )}
        </SettingsSection>
        <SettingsSection on="raised">
          {port.phone === undefined ? null : (
            <PreferenceRow<(typeof PHONE_AGES)[number]>
              on="raised"
              title={t.storage.phoneOlder}
              testID="storage-phone-age"
              value={phoneAge}
              options={PHONE_AGES.map((days) => ({
                value: days,
                label: t.storage.age[days],
                icon: 'history' as const,
              }))}
              onChange={setPhoneAge}
            />
          )}
          {port.phone === undefined ? null : (
            <SettingsRow
              on="raised"
              title={t.storage.phoneOlderAction}
              tone="danger"
              testID="storage-phone-older"
              onPress={() => clearPhoneOlder(Number(phoneAge))}
            />
          )}
          <SettingsRow
            on="raised"
            title={t.storage.imageCacheAction}
            tone="danger"
            testID="storage-phone-clear"
            onPress={clearImageCache}
          />
        </SettingsSection>
      </SettingsForm>
    </View>
  );
}
