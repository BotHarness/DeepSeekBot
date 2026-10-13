import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  ChannelHistoryItem,
  PurgePreview,
  PurgeSource,
} from '../../../core/src/purge/contracts.js';
import type { BridgeActions } from './actions.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow, SettingsRows } from './ds/settings-row.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { MessagingHelp } from './messaging-help.js';

const styles = stylex.create({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  grow: {
    flexGrow: 1,
    minWidth: 0,
    margin: 0,
    overflowWrap: 'anywhere',
  },
  heading: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  muted: {
    margin: 0,
    color: color.muted,
  },
  plain: { margin: 0 },
  list: {
    margin: 0,
    paddingInlineStart: space.x6,
    overflowWrap: 'anywhere',
  },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
  },
  sources: {
    display: 'flex',
    flexDirection: 'column',
  },
  source: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.x3,
    paddingBlock: space.x3,
    borderBottomWidth: '0.5px',
    borderBottomStyle: 'solid',
    borderBottomColor: color.border,
  },
  sourceLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: space.x3,
    flexGrow: 1,
    minWidth: 0,
    cursor: 'pointer',
  },
  checkbox: {
    flexShrink: 0,
    marginTop: space.x1,
    accentColor: color.accent,
  },
  sourceText: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  meta: {
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  sourceBody: { whiteSpace: 'pre-wrap' },
  older: { alignSelf: 'flex-start' },
});

export function ChannelHistory({
  actions,
  t,
  onClose,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose(): void;
}): ReactElement {
  const [channels, setChannels] = useState<ChannelHistoryItem[]>();
  const [channel, setChannel] = useState<ChannelHistoryItem>();
  const [sources, setSources] = useState<PurgeSource[]>([]);
  const [before, setBefore] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<PurgePreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState(false);
  const [cleanupPending, setCleanupPending] = useState(0);
  const date = (at: string): string => new Date(at).toLocaleString();
  const boundaries = [
    t('purge.noFiles'),
    t('purge.derivatives'),
    t('purge.disclosure'),
    t('purge.offline'),
  ].join('\n\n');
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    void actions.channelHistory().then(
      (items) => {
        if (active) setChannels(items);
      },
      (failure) => {
        if (active) setError(String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [actions]);
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await operation();
    } catch (failure) {
      setPreview(undefined);
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const open = async (item: ChannelHistoryItem, older?: string): Promise<void> => {
    const page = await actions.channelHistorySources(item.id, older);
    setChannel(item);
    setSources(page.sources);
    setBefore(page.before);
    setSelected([]);
    setPreview(undefined);
    setComplete(false);
  };
  const body = (
    <div ref={mount} data-channel-history="" {...stylex.props(styles.body)}>
      <div {...stylex.props(styles.row)}>
        <span {...stylex.props(styles.grow, styles.muted)}>{t('purge.historySummary')}</span>
        <MessagingHelp
          title={t('purge.history')}
          text={[t('purge.historyHint'), t('purge.slice')].join('\n\n')}
          t={t}
        />
      </div>
      {complete ? (
        <Note tone="success">
          {cleanupPending
            ? t('purge.cleanupPending', { count: cleanupPending })
            : t('purge.complete')}
        </Note>
      ) : null}
      {preview ? (
        <>
          <div {...stylex.props(styles.row)}>
            <h3 {...stylex.props(styles.grow, styles.heading)}>
              {t('purge.scope', { count: preview.sourceEventIds.length })}
            </h3>
            <MessagingHelp
              title={t('purge.scopeDetails')}
              text={t('purge.expiry', { at: date(preview.expiresAt) })}
              t={t}
            />
          </div>
          <ul {...stylex.props(styles.list)}>
            {sources
              .filter((source) => preview.sourceEventIds.includes(source.sourceEventId))
              .map((source) => (
                <li key={source.sourceEventId}>{source.body}</li>
              ))}
          </ul>
          <h3 {...stylex.props(styles.heading)}>{t('purge.placements')}</h3>
          <div {...stylex.props(styles.stack)}>
            {preview.placements.map((p) => (
              <div key={p.channelId + p.messageId} {...stylex.props(styles.row)}>
                <span {...stylex.props(styles.grow)}>{p.name}</span>
                <MessagingHelp title={p.name} text={p.channelId + '\n' + p.messageId} t={t} />
              </div>
            ))}
          </div>
          {preview.admissions.length ? (
            <>
              <h3 {...stylex.props(styles.heading)}>{t('purge.admissions')}</h3>
              <ul {...stylex.props(styles.list)}>
                {preview.admissions.map((a, i) => (
                  <li key={i}>
                    {a.botSlug} · {a.state}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p {...stylex.props(styles.muted)}>{t('purge.noAdmissions')}</p>
          )}
          {preview.files.length ? (
            <>
              <h3 {...stylex.props(styles.heading)}>{t('purge.files')}</h3>
              {preview.files.map((file) => (
                <div key={file.identity} {...stylex.props(styles.row)}>
                  <span {...stylex.props(styles.grow)}>
                    {file.name} ·{' '}
                    {t(file.disposition === 'shared' ? 'purge.fileShared' : 'purge.fileRemove')}
                  </span>
                  <MessagingHelp title={file.name} text={file.identity} t={t} />
                </div>
              ))}
            </>
          ) : null}
          {preview.effects.length ? (
            <div {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.grow)}>
                {t('purge.effects', { count: preview.effects.length })}
              </span>
              <MessagingHelp
                title={t('purge.effectsTitle')}
                text={
                  preview.effects
                    .map((effect) => `${effect.kind} · ${effect.state} · ${effect.id}`)
                    .join('\n') +
                  '\n\n' +
                  t('purge.effectsHint')
                }
                t={t}
              />
            </div>
          ) : null}
          <div {...stylex.props(styles.row)}>
            <span {...stylex.props(styles.grow)}>
              {t('purge.derivativeReport', {
                count: preview.derivatives.length,
              })}
            </span>
            <MessagingHelp
              title={t('purge.derivativeDetails')}
              text={
                preview.derivatives
                  .map((item) =>
                    [
                      item.kind,
                      item.botSlug,
                      t(
                        item.tracking === 'recorded'
                          ? 'purge.derivative.recorded'
                          : item.tracking === 'possible'
                            ? 'purge.derivative.possible'
                            : 'purge.derivative.unavailable',
                      ),
                      item.location,
                      item.reference,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  )
                  .join('\n') +
                '\n\n' +
                t('purge.derivatives')
              }
              t={t}
            />
          </div>
          <div {...stylex.props(styles.row)}>
            <p {...stylex.props(styles.grow)}>{t('purge.irreversible')}</p>
            <MessagingHelp title={t('purge.boundaries')} text={boundaries} t={t} />
          </div>
        </>
      ) : channel ? (
        <>
          <h3 {...stylex.props(styles.heading)}>{channel.name}</h3>
          <p {...stylex.props(styles.muted)}>
            {t('purge.endedAt', { at: date(channel.deletedAt) })}
          </p>
          <div {...stylex.props(styles.sources)}>
            {sources.map((source) => (
              <div
                key={source.sourceEventId}
                data-history-source={source.sourceEventId}
                {...stylex.props(styles.source)}
              >
                <label {...stylex.props(styles.sourceLabel)}>
                  <input
                    type="checkbox"
                    checked={selected.includes(source.sourceEventId)}
                    disabled={busy || !!source.purgedAt || !!source.refusal}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, source.sourceEventId]
                          : selected.filter((id) => id !== source.sourceEventId),
                      )
                    }
                    {...stylex.props(styles.checkbox)}
                  />
                  <span {...stylex.props(styles.sourceText)}>
                    <small {...stylex.props(styles.meta)}>{date(source.at)}</small>
                    <span {...stylex.props(styles.sourceBody)}>
                      {source.purgedAt ? t('purge.purged') : source.body}
                    </span>
                    {source.refusal ? (
                      <small {...stylex.props(styles.meta)}>{t('purge.unsupported')}</small>
                    ) : null}
                    {source.cleanupPending ? (
                      <small {...stylex.props(styles.meta)}>
                        {t('purge.cleanupPending', {
                          count: source.cleanupPending,
                        })}
                      </small>
                    ) : null}
                  </span>
                </label>
                <MessagingHelp
                  title={t('purge.messageDetails')}
                  text={
                    source.messageId +
                    (source.purgedAt
                      ? '\n' +
                        t('purge.tombstone', { at: date(source.purgedAt) }) +
                        '\n\n' +
                        boundaries
                      : '')
                  }
                  t={t}
                />
              </div>
            ))}
          </div>
          {!sources.length ? <p {...stylex.props(styles.plain)}>{t('purge.empty')}</p> : null}
          {before ? (
            <span {...stylex.props(styles.older)}>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void perform(() => open(channel, before))}
              >
                {t('purge.older')}
              </Button>
            </span>
          ) : null}
        </>
      ) : channels === undefined ? (
        <p {...stylex.props(styles.plain)}>{t('deletion.loading')}</p>
      ) : !channels.length ? (
        <p {...stylex.props(styles.plain)}>{t('purge.noChannels')}</p>
      ) : (
        <SettingsRows>
          {channels.map((item) => (
            <SettingsRow
              key={item.id}
              data={{ 'data-history-channel-id': item.id }}
              title={item.name}
              description={t('purge.endedAt', { at: date(item.deletedAt) })}
              control={
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void perform(() => open(item))}
                >
                  {t('purge.open')}
                </Button>
              }
            />
          ))}
        </SettingsRows>
      )}
    </div>
  );
  if (preview)
    return (
      <FormDialog
        title={t('purge.history')}
        size="standard"
        scroll
        onClose={() => {
          if (!busy) onClose();
        }}
        labels={{ close: t('common.close'), cancel: t('common.cancel') }}
        submitLabel={t('purge.confirm')}
        danger
        busy={busy}
        error={error}
        onCancel={() => {
          if (!busy) setPreview(undefined);
        }}
        onSubmit={() =>
          void perform(async () => {
            const result = await actions.channelPurgeConfirm(
              preview.channelId,
              preview.sourceEventIds,
              preview.token,
            );
            await open(channel!);
            setCleanupPending(result?.cleanupPending ?? 0);
            setComplete(true);
          })
        }
      >
        {body}
      </FormDialog>
    );
  return (
    <FormDialog
      title={t('purge.history')}
      size="standard"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.close') }}
      submitLabel={t('purge.preview')}
      submitDisabled={channel === undefined || !selected.length}
      busy={busy}
      error={error}
      secondary={
        channel === undefined ? undefined : (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setChannel(undefined);
              setSources([]);
              setSelected([]);
              setComplete(false);
            }}
          >
            {t('purge.back')}
          </Button>
        )
      }
      onCancel={() => {
        if (!busy) onClose();
      }}
      onSubmit={() => {
        if (channel === undefined) return;
        void perform(async () => {
          setPreview(await actions.channelPurgePreview(channel.id, selected));
          setComplete(false);
        });
      }}
    >
      {body}
    </FormDialog>
  );
}
