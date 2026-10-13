import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';

import type { PersonaBotDeletionPreview } from '../../../core/src/bots/deletion.js';
import type { BridgeActions } from './actions.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { HostFileOptions } from './host-file-actions.js';
import { Callout } from './ds/callout.js';
import { FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

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
  notices: {
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
  noticeTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
    fontWeight: text.strong,
  },
  noticeIcon: { display: 'inline-flex', flexShrink: 0, color: color.muted },
  danger: { color: color.danger },
  noticeText: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    color: color.muted,
  },
  path: {
    overflowWrap: 'anywhere',
    fontFamily: 'var(--dsw-font-family-mono)',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
  },
  choice: {
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  retry: { alignSelf: 'flex-start' },
});

function DeletionNotice({
  icon,
  title,
  tone,
  children,
}: {
  icon: string;
  title: string;
  tone?: 'danger';
  children: ReactNode;
}): ReactElement {
  return (
    <Callout
      tone={tone ?? 'muted'}
      borderless
      title={
        <span {...stylex.props(styles.noticeTitle)}>
          <span
            aria-hidden="true"
            {...stylex.props(styles.noticeIcon, tone === 'danger' && styles.danger)}
          >
            <ChannelSidebarIcon name={icon} size={16} />
          </span>
          <strong>{title}</strong>
        </span>
      }
    >
      <div {...stylex.props(styles.noticeText)}>{children}</div>
    </Callout>
  );
}

export function PersonaBotDeletionView({
  slug,
  actions,
  t,
  onClose,
  history = false,
}: {
  slug: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose(): void;
  history?: boolean;
}): ReactElement {
  const [preview, setPreview] = useState<PersonaBotDeletionPreview>();
  const [erase, setErase] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [handlers, setHandlers] = useState<HostFileOptions>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    setErase(false);
    void actions.deletionPreview(slug).then(
      (next) => {
        if (active) setPreview(next);
      },
      (failure) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [actions, slug]);
  const perform = async (operation: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await operation();
    } catch (failure) {
      setErase(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };
  const state = preview?.deletion;
  const content = (
    <div ref={mount} {...stylex.props(styles.content)}>
      {preview === undefined ? (
        <p {...stylex.props(styles.plain)}>{t('deletion.loading')}</p>
      ) : (
        <>
          <p {...stylex.props(styles.lead)}>
            {state === undefined
              ? t('deletion.lead', { name: preview.displayName })
              : t('deletion.history')}
          </p>
          <section aria-label={t('deletion.notice')} {...stylex.props(styles.notices)}>
            {state === undefined ? (
              <>
                <h3 {...stylex.props(styles.heading)}>{t('deletion.notice')}</h3>
                <DeletionNotice icon="lock" tone="danger" title={t('deletion.secretsTitle')}>
                  {t('deletion.secretsBody')}
                </DeletionNotice>
                <DeletionNotice icon="plug" title={t('deletion.authorityTitle')}>
                  {t('deletion.authorityBody', {
                    sessions: preview.dependencies.sessions.length,
                    grants:
                      preview.dependencies.grants.length + preview.dependencies.identities.length,
                  })}
                </DeletionNotice>
                <DeletionNotice icon="messages-square" title={t('deletion.retainTitle')}>
                  {t('deletion.retainBody', {
                    channels: preview.dependencies.channels.length,
                  })}
                  {preview.dependencies.workspaces.map((workspace) => (
                    <span key={workspace} {...stylex.props(styles.path)}>
                      {workspace}
                    </span>
                  ))}
                </DeletionNotice>
              </>
            ) : null}
            <DeletionNotice icon="files" title={t('deletion.memoryTitle')}>
              <span {...stylex.props(styles.path)}>{preview.memoryDir}</span>
              <span {...stylex.props(styles.actions)}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title={t('deletion.hostFolder')}
                  disabled={busy || state?.memory === 'erased'}
                  onClick={() => void perform(() => actions.deletionFolderOpen(slug))}
                >
                  {t('deletion.openFolder')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy || state?.memory === 'erased'}
                  onClick={() =>
                    void perform(async () => {
                      const options = await actions.deletionFolderApplications(slug);
                      setHandlers(options);
                      if (!options.available) throw new Error(t('deletion.noHandler'));
                    })
                  }
                >
                  {t('deletion.otherApp')}
                </Button>
                {handlers?.applications.map((app) => (
                  <Button
                    key={app.id}
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void perform(() =>
                        actions.deletionFolderOpen(slug, {
                          application: app.id,
                        }),
                      )
                    }
                  >
                    {app.name}
                  </Button>
                ))}
              </span>
              {state === undefined ? (
                <>
                  <Checkbox
                    checked={erase}
                    disabled={busy || !preview.eraseAvailable}
                    label={t('deletion.eraseMemory')}
                    className={stylex.props(styles.choice).className}
                    onChange={setErase}
                  />
                  {preview.refusal === undefined ? null : <span>{preview.refusal}</span>}
                  <span>{t(erase ? 'deletion.eraseScope' : 'deletion.retainScope')}</span>
                </>
              ) : (
                <span>
                  {t(
                    state.memory === 'erased'
                      ? 'deletion.erased'
                      : state.memory === 'pending'
                        ? 'deletion.pending'
                        : 'deletion.retained',
                  )}
                </span>
              )}
            </DeletionNotice>
          </section>
          {state === undefined ? null : (
            <>
              {state.failure === undefined ? null : <Note tone="danger">{state.failure}</Note>}
              {state.phase !== 'complete' ? (
                <span {...stylex.props(styles.retry)}>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await actions.deletionRetry(slug);
                        setPreview(await actions.deletionPreview(slug));
                      })
                    }
                  >
                    {t('deletion.retry')}
                  </Button>
                </span>
              ) : null}
            </>
          )}
        </>
      )}
      {history && error !== undefined ? <Note tone="danger">{error}</Note> : null}
    </div>
  );
  if (history)
    return (
      <section className="bh-profile-section">
        <h2>{t('deletion.deleted')}</h2>
        {content}
      </section>
    );
  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const cancel = (): void => {
    if (!busy) onClose();
  };
  if (state !== undefined)
    return (
      <FormDialog
        title={t('deletion.title')}
        size="small"
        labels={labels}
        submitLabel={t('common.close')}
        showCancel={false}
        busy={busy}
        error={error}
        onCancel={cancel}
        onSubmit={onClose}
      >
        {content}
      </FormDialog>
    );
  return (
    <FormDialog
      title={t('deletion.title')}
      size="small"
      labels={labels}
      submitLabel={t(erase ? 'deletion.confirmErase' : 'deletion.confirmRetain')}
      submitDisabled={preview === undefined || (erase && !preview.eraseAvailable)}
      busy={busy}
      danger
      error={error}
      onCancel={cancel}
      onSubmit={() =>
        void perform(async () => {
          if (preview === undefined) return;
          await actions.deletionConfirm(slug, preview.token, erase);
          setErase(false);
          setPreview(await actions.deletionPreview(slug));
        })
      }
    >
      {content}
    </FormDialog>
  );
}
