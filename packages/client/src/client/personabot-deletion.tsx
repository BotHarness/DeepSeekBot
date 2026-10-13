import { useState, type ReactElement, type ReactNode } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { PersonaBotDeletionPreview } from '../../../core/src/bots/deletion.js';
import type { BridgeActions } from './actions.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { HostFileOptions } from './host-file-actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';

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
    <div className="bh-bot-deletion-notice" data-tone={tone}>
      <span className="bh-bot-deletion-notice-icon" aria-hidden="true">
        <ChannelSidebarIcon name={icon} size={16} />
      </span>
      <div className="bh-bot-deletion-notice-text">
        <strong className="bh-bot-deletion-notice-title">{title}</strong>
        {children}
      </div>
    </div>
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
    <div ref={mount} className="bh-bot-deletion">
      {preview === undefined ? (
        <p>{t('deletion.loading')}</p>
      ) : (
        <>
          <p className="bh-bot-deletion-lead">
            {state === undefined
              ? t('deletion.lead', { name: preview.displayName })
              : t('deletion.history')}
          </p>
          <section className="bh-bot-deletion-notices" aria-label={t('deletion.notice')}>
            {state === undefined ? (
              <>
                <h3 className="bh-bot-deletion-heading">{t('deletion.notice')}</h3>
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
                  {t('deletion.retainBody', { channels: preview.dependencies.channels.length })}
                  {preview.dependencies.workspaces.map((workspace) => (
                    <span key={workspace} className="bh-bot-deletion-path">
                      {workspace}
                    </span>
                  ))}
                </DeletionNotice>
              </>
            ) : null}
            <DeletionNotice icon="files" title={t('deletion.memoryTitle')}>
              <span className="bh-bot-deletion-path">{preview.memoryDir}</span>
              <span className="bh-bot-deletion-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  title={t('deletion.hostFolder')}
                  disabled={busy || state?.memory === 'erased'}
                  onClick={() => void perform(() => actions.deletionFolderOpen(slug))}
                >
                  {t('deletion.openFolder')}
                </Button>
                <Button
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
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void perform(() => actions.deletionFolderOpen(slug, { application: app.id }))
                    }
                  >
                    {app.name}
                  </Button>
                ))}
              </span>
              {state === undefined ? (
                <>
                  <label className="bh-bot-deletion-choice">
                    <input
                      type="checkbox"
                      checked={erase}
                      disabled={busy || !preview.eraseAvailable}
                      onChange={(event) => setErase(event.target.checked)}
                    />
                    {t('deletion.eraseMemory')}
                  </label>
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
              {state.failure === undefined ? null : (
                <p className="bh-modal-error" role="alert">
                  {state.failure}
                </p>
              )}
              {state.phase !== 'complete' ? (
                <Button
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
              ) : null}
            </>
          )}
        </>
      )}
      {error === undefined ? null : (
        <p className="bh-modal-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
  if (history)
    return (
      <section className="bh-profile-section">
        <h2>{t('deletion.deleted')}</h2>
        {content}
      </section>
    );
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title={t('deletion.title')}
      closeLabel={t('common.cancel')}
      className="bh-sidebar-modal bh-bot-deletion-modal"
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          {state === undefined ? (
            <Button
              variant="primary"
              className="bh-im-danger"
              disabled={busy || preview === undefined || (erase && !preview.eraseAvailable)}
              onClick={() =>
                void perform(async () => {
                  if (preview === undefined) return;
                  await actions.deletionConfirm(slug, preview.token, erase);
                  setErase(false);
                  setPreview(await actions.deletionPreview(slug));
                })
              }
            >
              {t(erase ? 'deletion.confirmErase' : 'deletion.confirmRetain')}
            </Button>
          ) : null}
        </>
      }
    >
      {content}
    </Modal>
  );
}
