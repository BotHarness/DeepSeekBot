import { useContext, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import { FileTypeIcon, IconFolderOpenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BotHarnessTranslate } from './locale.js';
import { RemoteMessageHostContext } from './remote-message-host.js';
import type { BridgeActions } from './actions.js';
import { createBridgeFileResource } from './bridge-file-resource.js';
import { useHostFileMenu } from './host-file-menu.js';
import { useMountedResource } from './mounted-resource.js';

export function BridgeFile({
  channelId,
  sourceEventId,
  attachmentId,
  name,
  sizeBytes,
  actions,
  t,
}: {
  channelId: string;
  sourceEventId: string;
  attachmentId: string;
  name: string;
  sizeBytes?: number | undefined;
  actions?: Pick<BridgeActions, 'bridgeFileCommands'> | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const fetcher = useContext(RemoteMessageHostContext)?.fetch;
  const resource = useMemo(
    () => createBridgeFileResource(channelId, sourceEventId, attachmentId, fetcher),
    [channelId, sourceEventId, attachmentId, fetcher],
  );
  const state = useSyncExternalStore(
    resource.subscribe,
    resource.getSnapshot,
    resource.getSnapshot,
  );
  const commands = useMemo(() => {
    const host = actions?.bridgeFileCommands?.(sourceEventId);
    return host === undefined ? undefined : { ...host, download: () => resource.download(name) };
  }, [actions, sourceEventId, resource, name]);
  const [canOpen, setCanOpen] = useState(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    setCanOpen(false);
    void commands?.available().then(
      (available) => {
        if (active) setCanOpen(available);
      },
      () => {
        if (active) setCanOpen(false);
      },
    );
    return () => {
      active = false;
    };
  }, [commands]);
  const menu = useHostFileMenu(commands, channelId, t);
  const failureKeys = {
    unavailable: 'bridgeFile.unavailable',
    tooLarge: 'bridgeFile.tooLarge',
    format: 'bridgeFile.format',
    failed: 'bridgeFile.failed',
  } as const;
  return (
    <div ref={mount} className="bh-message-attachment">
      <div className="bh-message-file">
        <button
          type="button"
          className="bh-message-file-main"
          disabled={state.loading}
          aria-busy={state.loading === true}
          aria-label={t('fileAction.download') + ': ' + name}
          onClick={() => {
            void resource.download(name);
          }}
        >
          <span className="bh-message-file-icon" aria-hidden="true">
            <FileTypeIcon path={name} size={28} />
          </span>
          <span className="bh-message-file-copy">
            <span className="bh-message-file-name" title={name}>
              {name}
            </span>
            <span className="bh-message-file-size">
              {t('bridgeMedia.file')}
              {sizeBytes === undefined
                ? ''
                : ' · ' + Math.max(1, Math.round(sizeBytes / 1024)) + ' KB'}
            </span>
          </span>
        </button>
        {commands && canOpen ? (
          <>
            <span className="bh-message-file-divider" aria-hidden="true" />
            <button
              type="button"
              className="bh-message-file-download"
              aria-label={t('fileAction.chooseApp') + ': ' + name}
              aria-haspopup="menu"
              aria-expanded={menu.isOpen}
              onClick={(event) => menu.open(attachmentId, event)}
            >
              <IconFolderOpenOutlineRegular size={16} />
            </button>
          </>
        ) : null}
      </div>
      {state.loading ? <div role="status">{t('bridgeFile.loading')}</div> : null}
      {state.failure ? (
        <div role="alert">
          <span>{t(failureKeys[state.failure])}</span>{' '}
          <button
            type="button"
            className="bh-memory-view-action"
            onClick={() => {
              void resource.download(name);
            }}
          >
            {t('bridgeMedia.retry')}
          </button>
        </div>
      ) : null}
      {menu.menu}
      {menu.feedback}
    </div>
  );
}
