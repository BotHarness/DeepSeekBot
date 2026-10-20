import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { formatBotZipSize } from './bot-zip.js';
import {
  confirmDataReset,
  loadDataResetPreview,
  type BridgeCall,
  type DataResetPreview,
  type DataResetResult,
} from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { Callout } from './ds/callout.js';
import { DangerTextButton, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessKey } from './locale.js';

const styles = stylex.create({
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x5,
    minWidth: 0,
  },
  plain: { margin: 0 },
  lead: {
    margin: 0,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
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
  itemTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
    fontWeight: text.strong,
  },
  icon: { display: 'inline-flex', flexShrink: 0, color: color.muted },
  danger: { color: color.danger },
  itemText: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    minWidth: 0,
    color: color.muted,
  },
  path: {
    overflowWrap: 'anywhere',
    fontFamily: 'var(--dsw-font-family-mono)',
  },
  choice: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
});

const TARGETS: Record<
  DataResetPreview['targets'][number]['kind'],
  { icon: string; title: BotHarnessKey; body: BotHarnessKey }
> = {
  data: { icon: 'bot', title: 'dataReset.target.data', body: 'dataReset.target.dataBody' },
  'im-settings': {
    icon: 'messages-square',
    title: 'dataReset.target.im',
    body: 'dataReset.target.imBody',
  },
  'local-tools': {
    icon: 'cpu',
    title: 'dataReset.target.tools',
    body: 'dataReset.target.toolsBody',
  },
};

const KEPT: Record<
  DataResetPreview['kept'][number]['kind'],
  { icon: string; title: BotHarnessKey }
> = {
  credentials: { icon: 'lock', title: 'dataReset.kept.credentials' },
  memory: { icon: 'brain', title: 'dataReset.kept.memory' },
  exports: { icon: 'files', title: 'dataReset.kept.exports' },
};

function Item({
  icon,
  title,
  danger = false,
  children,
}: {
  icon: string;
  title: string;
  danger?: boolean;
  children: ReactElement | ReactElement[];
}): ReactElement {
  return (
    <Callout
      tone="muted"
      borderless
      title={
        <span {...stylex.props(styles.itemTitle)}>
          <span aria-hidden="true" {...stylex.props(styles.icon, danger && styles.danger)}>
            <ChannelSidebarIcon name={icon} size={16} />
          </span>
          <strong>{title}</strong>
        </span>
      }
    >
      <div {...stylex.props(styles.itemText)}>{children}</div>
    </Callout>
  );
}

export type DataResetSettingsProps = PropsLocale<'botharness'> & InjectFace<{ call: BridgeCall }>;

export function DataResetSettings({ call, t }: DataResetSettingsProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DataResetPreview>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [result, setResult] = useState<DataResetResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const request = useRef<AbortController | undefined>(undefined);
  const show = (): void => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setOpen(true);
    setPreview(undefined);
    setAcknowledged(false);
    setResult(undefined);
    setError(undefined);
    loadDataResetPreview(call, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setPreview(value);
      },
      () => {
        if (!controller.signal.aborted) setError(t('dataReset.error'));
      },
    );
  };
  const close = (): void => {
    if (busy) return;
    request.current?.abort();
    setOpen(false);
  };
  const confirm = async (): Promise<void> => {
    if (preview === undefined || !acknowledged || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await confirmDataReset(call, preview.token));
    } catch {
      setAcknowledged(false);
      setError(t('dataReset.error'));
    } finally {
      setBusy(false);
    }
  };
  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  return (
    <SettingsRow
      title={t('dataReset.row.title')}
      description={t('dataReset.row.description')}
      data={{ 'data-data-reset-setting': '' }}
      control={<DangerTextButton onClick={show}>{t('dataReset.row.action')}</DangerTextButton>}
    >
      {!open ? null : result !== undefined ? (
        <FormDialog
          title={t('dataReset.title')}
          size="small"
          labels={labels}
          submitLabel={t('common.close')}
          showCancel={false}
          onCancel={close}
          onSubmit={close}
        >
          <p data-data-reset-result={result.status} {...stylex.props(styles.lead)}>
            {t(result.status === 'restarting' ? 'dataReset.restarting' : 'dataReset.restartManual')}
          </p>
        </FormDialog>
      ) : (
        <FormDialog
          title={t('dataReset.title')}
          size="small"
          scroll
          labels={labels}
          submitLabel={t(
            preview?.restartable === false ? 'dataReset.confirmManual' : 'dataReset.confirm',
          )}
          submitDisabled={preview === undefined || !acknowledged}
          submitData={{ 'data-data-reset-confirm': '' }}
          busy={busy}
          danger
          error={error}
          onCancel={close}
          onSubmit={() => void confirm()}
        >
          {preview === undefined ? (
            <p {...stylex.props(styles.plain)}>{t('dataReset.loading')}</p>
          ) : (
            <div data-data-reset-preview="" {...stylex.props(styles.content)}>
              <p {...stylex.props(styles.lead)}>{t('dataReset.lead', { bots: preview.bots })}</p>
              <section aria-label={t('dataReset.removed')} {...stylex.props(styles.group)}>
                <h3 {...stylex.props(styles.heading)}>{t('dataReset.removed')}</h3>
                {preview.targets.length === 0 ? (
                  <p {...stylex.props(styles.plain)}>{t('dataReset.nothing')}</p>
                ) : (
                  preview.targets.map((target) => (
                    <Item
                      key={target.path}
                      icon={TARGETS[target.kind].icon}
                      title={t(TARGETS[target.kind].title)}
                      danger
                    >
                      <span>{t(TARGETS[target.kind].body)}</span>
                      <span {...stylex.props(styles.path)}>{target.path}</span>
                      <span>
                        {t(target.partial === true ? 'dataReset.sizeMore' : 'dataReset.size', {
                          size: formatBotZipSize(target.bytes),
                          files: target.files,
                        })}
                      </span>
                    </Item>
                  ))
                )}
              </section>
              <section aria-label={t('dataReset.kept')} {...stylex.props(styles.group)}>
                <h3 {...stylex.props(styles.heading)}>{t('dataReset.kept')}</h3>
                {preview.kept.map((kept) => (
                  <Item
                    key={kept.path}
                    icon={KEPT[kept.kind].icon}
                    title={t(KEPT[kept.kind].title)}
                  >
                    <span {...stylex.props(styles.path)}>{kept.path}</span>
                  </Item>
                ))}
              </section>
              {preview.restartable ? null : <Note tone="danger">{t('dataReset.manualNote')}</Note>}
              <Checkbox
                checked={acknowledged}
                disabled={busy}
                label={t('dataReset.acknowledge')}
                className={stylex.props(styles.choice).className}
                onChange={setAcknowledged}
              />
            </div>
          )}
        </FormDialog>
      )}
    </SettingsRow>
  );
}
