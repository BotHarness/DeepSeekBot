import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { formatBotZipSize } from './bot-zip.js';
import {
  BridgeCallError,
  confirmStorageCleanup,
  loadStorageUsage,
  previewStorageCleanup,
  STORAGE_MEDIA_KINDS,
  type BridgeCall,
  type StorageCleanupPreview,
  type StorageCleanupResult,
  type StorageMediaKind,
  type StorageUsage,
} from './bridge.js';
import { PillButton } from './ds/pill-button.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow } from './ds/settings-row.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey } from './locale.js';

const styles = stylex.create({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x5,
    minWidth: 0,
  },
  plain: { margin: 0 },
  muted: { margin: 0, color: color.muted },
  total: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  bar: {
    display: 'flex',
    height: space.x2,
    overflow: 'hidden',
    borderRadius: radius.xs,
    backgroundColor: color.hover,
  },
  legend: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: `${space.x2} ${space.x5}`,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  legendItem: { display: 'inline-flex', alignItems: 'center', gap: space.x2 },
  swatch: {
    width: space.x2,
    height: space.x2,
    borderRadius: radius.round,
    flexShrink: 0,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
  },
  heading: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
  },
  field: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
  },
  kinds: { display: 'flex', flexWrap: 'wrap', gap: `${space.x2} ${space.x5}` },
  chats: {
    display: 'flex',
    flexDirection: 'column',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
    borderRadius: radius.sm,
  },
  chat: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderTopWidth: { default: border.hairline, ':first-child': 0 },
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  chatMeta: {
    flexShrink: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontVariantNumeric: 'tabular-nums',
  },
  choice: {
    minWidth: 0,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
});

const PARTS: Record<StorageUsage['parts'][number]['kind'], { label: BotHarnessKey; fill: string }> =
  {
    media: { label: 'storage.part.media', fill: color.accent },
    messages: { label: 'storage.part.messages', fill: color.success },
    memory: { label: 'storage.part.memory', fill: color.warning },
    other: { label: 'storage.part.other', fill: color.subtle },
  };

const KINDS: Record<StorageMediaKind, BotHarnessKey> = {
  image: 'storage.kind.image',
  video: 'storage.kind.video',
  audio: 'storage.kind.audio',
  file: 'storage.kind.file',
};

const KEPT: Record<StorageCleanupPreview['kept'][number]['reason'], BotHarnessKey> = {
  'bot-working': 'storage.kept.botWorking',
  'delivery-pending': 'storage.kept.deliveryPending',
  memory: 'storage.kept.memory',
  migration: 'storage.kept.migration',
};

const AGES = ['30', '90', '180', '365', 'all'] as const;
type Age = (typeof AGES)[number];
const DAY = 24 * 60 * 60 * 1000;

function cutoff(age: Age): string {
  return new Date(age === 'all' ? Date.now() : Date.now() - Number(age) * DAY).toISOString();
}

export type StorageSettingsProps = PropsLocale<'botharness'> & InjectFace<{ call: BridgeCall }>;

export function StorageSettings({ call, t }: StorageSettingsProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState<StorageUsage>();
  const [age, setAge] = useState<Age>('90');
  const [kinds, setKinds] = useState<StorageMediaKind[]>([...STORAGE_MEDIA_KINDS]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [preview, setPreview] = useState<StorageCleanupPreview>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<StorageCleanupResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | undefined>(undefined);
  const measure = (): void => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setUsage(undefined);
    loadStorageUsage(call, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setUsage(value);
      },
      () => {
        if (!controller.signal.aborted) setError(t('storage.error'));
      },
    );
  };
  const show = (): void => {
    setOpen(true);
    setPreview(undefined);
    setAcknowledged(false);
    setResult(undefined);
    setError(undefined);
    measure();
  };
  const close = (): void => {
    if (busy) return;
    request.current?.abort();
    setOpen(false);
  };
  const chats = usage?.chats.filter((chat) => chat.mediaBytes > 0) ?? [];
  const selected = chats.filter((chat) => !excluded.includes(chat.channelId));
  const review = async (): Promise<void> => {
    if (busy || selected.length === 0 || kinds.length === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      setPreview(
        await previewStorageCleanup(call, {
          before: cutoff(age),
          ...(selected.length === chats.length
            ? {}
            : { channelIds: selected.map((chat) => chat.channelId) }),
          kinds,
        }),
      );
      setAcknowledged(false);
    } catch {
      setError(t('storage.error'));
    } finally {
      setBusy(false);
    }
  };
  const confirm = async (): Promise<void> => {
    if (preview === undefined || !acknowledged || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await confirmStorageCleanup(call, preview));
    } catch (failure) {
      setAcknowledged(false);
      if (failure instanceof BridgeCallError && failure.code === 'storage-preview-stale') {
        setPreview(undefined);
        setError(t('storage.stale'));
      } else setError(t('storage.error'));
    } finally {
      setBusy(false);
    }
  };
  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const back = (): void => {
    setPreview(undefined);
    setError(undefined);
  };
  return (
    <SettingsRow
      title={t('storage.row.title')}
      description={t('storage.row.description')}
      data={{ 'data-storage-setting': '' }}
      control={
        <PillButton onClick={show} data-storage-open="">
          {t('storage.row.action')}
        </PillButton>
      }
    >
      {!open ? null : result !== undefined ? (
        <FormDialog
          title={t('storage.title')}
          size="small"
          labels={labels}
          submitLabel={t('common.close')}
          showCancel={false}
          onCancel={close}
          onSubmit={close}
        >
          <p data-storage-result="" {...stylex.props(styles.total)}>
            {t('storage.done', { files: result.files, size: formatBotZipSize(result.freedBytes) })}
          </p>
        </FormDialog>
      ) : preview !== undefined ? (
        <FormDialog
          title={t('storage.title')}
          size="small"
          scroll
          labels={labels}
          submitLabel={t('storage.confirm')}
          submitDisabled={preview.files === 0 || !acknowledged}
          submitData={{ 'data-storage-confirm': '' }}
          busy={busy}
          danger
          error={error}
          secondary={
            <Button type="button" variant="ghost" disabled={busy} onClick={back}>
              {t('storage.back')}
            </Button>
          }
          onCancel={close}
          onSubmit={() => void confirm()}
        >
          <div data-storage-preview="" {...stylex.props(styles.content)}>
            {preview.files === 0 ? (
              <p {...stylex.props(styles.plain)}>{t('storage.nothing')}</p>
            ) : (
              <p {...stylex.props(styles.total)}>
                {t('storage.previewLead', {
                  files: preview.files,
                  messages: preview.messages,
                  size: formatBotZipSize(preview.freedBytes),
                })}
              </p>
            )}
            <p {...stylex.props(styles.muted)}>{t('storage.textKept')}</p>
            {preview.freedBytes < preview.bytes ? <Note>{t('storage.previewShared')}</Note> : null}
            {preview.kept.map((kept) => (
              <Note key={kept.reason}>{t(KEPT[kept.reason], { files: kept.files })}</Note>
            ))}
            {preview.files === 0 ? null : (
              <Checkbox
                checked={acknowledged}
                disabled={busy}
                label={t('storage.acknowledge')}
                className={stylex.props(styles.choice).className}
                onChange={setAcknowledged}
              />
            )}
          </div>
        </FormDialog>
      ) : (
        <FormDialog
          title={t('storage.title')}
          size="small"
          scroll
          labels={labels}
          submitLabel={t('storage.preview')}
          submitDisabled={usage === undefined || selected.length === 0 || kinds.length === 0}
          submitData={{ 'data-storage-review': '' }}
          busy={busy}
          error={error}
          onCancel={close}
          onSubmit={() => void review()}
        >
          {usage === undefined ? (
            <p {...stylex.props(styles.plain)}>{t('storage.loading')}</p>
          ) : (
            <div data-storage-usage="" {...stylex.props(styles.content)}>
              <section aria-label={t('storage.used')} {...stylex.props(styles.group)}>
                <p data-storage-total={usage.totalBytes} {...stylex.props(styles.total)}>
                  {t('storage.total', { size: formatBotZipSize(usage.totalBytes) })}
                </p>
                <div aria-hidden="true" {...stylex.props(styles.bar)}>
                  {usage.parts.map((part) =>
                    part.bytes === 0 || usage.totalBytes === 0 ? null : (
                      <span
                        key={part.kind}
                        style={{
                          width: `${(part.bytes / usage.totalBytes) * 100}%`,
                          minWidth: 2,
                          background: PARTS[part.kind].fill,
                        }}
                      />
                    ),
                  )}
                </div>
                <ul {...stylex.props(styles.legend)}>
                  {usage.parts.map((part) => (
                    <li
                      key={part.kind}
                      data-storage-part={part.kind}
                      {...stylex.props(styles.legendItem)}
                    >
                      <span
                        aria-hidden="true"
                        style={{ background: PARTS[part.kind].fill }}
                        {...stylex.props(styles.swatch)}
                      />
                      {t(PARTS[part.kind].label)} {formatBotZipSize(part.bytes)}
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-label={t('storage.clean.heading')} {...stylex.props(styles.group)}>
                <h3 {...stylex.props(styles.heading)}>{t('storage.clean.heading')}</h3>
                <p {...stylex.props(styles.muted)}>{t('storage.textKept')}</p>
                {chats.length === 0 ? (
                  <p {...stylex.props(styles.plain)}>{t('storage.noMedia')}</p>
                ) : (
                  <>
                    <div {...stylex.props(styles.field)}>
                      <span>{t('storage.olderThan')}</span>
                      <Select
                        label={t('storage.olderThan')}
                        value={age}
                        options={AGES.map((value) => ({
                          value,
                          label: t(value === 'all' ? 'storage.age.all' : 'storage.age.days', {
                            days: value,
                          }),
                        }))}
                        onChange={setAge}
                      />
                    </div>
                    <div
                      role="group"
                      aria-label={t('storage.kinds')}
                      {...stylex.props(styles.kinds)}
                    >
                      {STORAGE_MEDIA_KINDS.map((kind) => (
                        <Checkbox
                          key={kind}
                          checked={kinds.includes(kind)}
                          label={t(KINDS[kind])}
                          className={stylex.props(styles.choice).className}
                          onChange={(checked) =>
                            setKinds((current) =>
                              STORAGE_MEDIA_KINDS.filter((item) =>
                                item === kind ? checked : current.includes(item),
                              ),
                            )
                          }
                        />
                      ))}
                    </div>
                    <ul aria-label={t('storage.chats')} {...stylex.props(styles.chats)}>
                      {chats.map((chat) => (
                        <li
                          key={chat.channelId}
                          data-storage-chat={chat.channelId}
                          {...stylex.props(styles.chat)}
                        >
                          <Checkbox
                            checked={!excluded.includes(chat.channelId)}
                            label={
                              chat.deleted === true
                                ? t('storage.chat.deleted', { name: chat.name })
                                : chat.name
                            }
                            className={stylex.props(styles.choice).className}
                            onChange={(checked) =>
                              setExcluded((current) =>
                                checked
                                  ? current.filter((id) => id !== chat.channelId)
                                  : [...current, chat.channelId],
                              )
                            }
                          />
                          <span {...stylex.props(styles.chatMeta)}>
                            {formatBotZipSize(chat.mediaBytes)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            </div>
          )}
        </FormDialog>
      )}
    </SettingsRow>
  );
}
