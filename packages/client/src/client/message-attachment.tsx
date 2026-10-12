import { useMemo, type ReactElement } from 'react';
import {
  FileTypeIcon,
  IconDownloadOutlineRegular,
  IconEllipsisOutlineRegular,
  Tooltip,
  fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import { channelAttachmentUrl } from './bridge.js';
import { HostFileOpenButton, useHostFileMenu, type HostFileCommands } from './host-file-menu.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelAttachmentRef } from './store.js';
import { MessageAudio } from './message-audio.js';

export function MessageAttachment({
  attachment: ref,
  channelId,
  messageId,
  actions,
  t,
}: {
  attachment: ChannelAttachmentRef;
  channelId?: string | undefined;
  messageId: string;
  actions?:
    | (Pick<
        BridgeActions,
        | 'messageAttachmentTarget'
        | 'messageAttachmentApplications'
        | 'messageAttachmentOpen'
        | 'messageAttachmentDownload'
      > &
        Partial<Pick<BridgeActions, 'fileOpenPreferences'>>)
    | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const commands = useMemo<HostFileCommands | undefined>(
    () =>
      actions === undefined
        ? undefined
        : {
            target: (owner, id) => actions.messageAttachmentTarget(owner, messageId, id),
            applications: (owner, id) =>
              actions.messageAttachmentApplications(owner, messageId, id),
            open: (owner, id, choice) =>
              actions.messageAttachmentOpen(owner, messageId, id, choice),
            download: (owner, id) => actions.messageAttachmentDownload(owner, messageId, id),
            preferences: actions.fileOpenPreferences,
          },
    [actions, messageId],
  );
  const menu = useHostFileMenu(commands, channelId, t);
  const id = ref.fileId;
  const url =
    channelId !== undefined ? channelAttachmentUrl(ref, { channelId, messageId }) : undefined;
  const image = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(ref.mime);
  const audio = ref.mime.startsWith('audio/');
  if (audio) {
    return (
      <div
        className="bh-message-attachment"
        onContextMenu={id === undefined ? undefined : (event) => menu.open(id, event)}
        onKeyDown={id === undefined ? undefined : (event) => menu.onKey(id, event)}
      >
        <MessageAudio name={ref.name} size={ref.size} url={url} t={t} />
        {menu.menu}
        {menu.feedback}
      </div>
    );
  }
  const contents = (
    <>
      <span className="bh-message-file-icon" aria-hidden="true">
        <FileTypeIcon path={ref.name} size={28} />
      </span>
      <span className="bh-message-file-copy">
        <span className="bh-message-file-name" title={ref.name}>
          {ref.name}
        </span>
        <span className="bh-message-file-size">{fileSizeText(ref.size)}</span>
      </span>
    </>
  );
  const downloadAction =
    url === undefined ? null : (
      <>
        <span className="bh-message-file-divider" aria-hidden="true" />
        <Tooltip label={t('fileAction.download')} side="bottom" delayMs={500}>
          <a
            className="bh-message-file-download"
            href={url}
            download={ref.name}
            aria-label={`${t('fileAction.download')}: ${ref.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <IconDownloadOutlineRegular size={16} />
          </a>
        </Tooltip>
      </>
    );
  const hostMenuButton =
    id === undefined ? null : (
      <Tooltip label={t('fileAction.menu')} side="bottom" delayMs={500}>
        <button
          type="button"
          className="bh-memory-view-icon-button bh-message-file-more"
          aria-label={t('fileAction.menu') + ': ' + ref.name}
          aria-haspopup="menu"
          aria-expanded={menu.isOpen}
          disabled={channelId === undefined || commands === undefined}
          onClick={(event) => menu.open(id, event)}
        >
          <IconEllipsisOutlineRegular size={16} />
        </button>
      </Tooltip>
    );
  return (
    <div
      className="bh-message-attachment"
      onContextMenu={id === undefined ? undefined : (event) => menu.open(id, event)}
      onKeyDown={id === undefined ? undefined : (event) => menu.onKey(id, event)}
    >
      {image ? (
        <div className="bh-message-image-row">
          <a className="bh-message-image-link" href={url} target="_blank" rel="noopener noreferrer">
            <img className="bh-message-image" src={url} alt={ref.name} loading="lazy" />
          </a>
          {hostMenuButton}
        </div>
      ) : (
        <div className="bh-message-file">
          {id === undefined ? (
            <a className="bh-message-file-main" href={url} download={ref.name}>
              {contents}
            </a>
          ) : (
            <button
              type="button"
              className="bh-message-file-main"
              aria-haspopup="menu"
              aria-expanded={menu.isOpen}
              disabled={channelId === undefined || commands === undefined}
              onClick={(event) => menu.open(id, event)}
            >
              {contents}
            </button>
          )}
          {id === undefined || channelId === undefined || commands === undefined ? null : (
            <>
              <span className="bh-message-file-divider" aria-hidden="true" />
              <HostFileOpenButton
                actions={commands}
                slug={channelId}
                path={id}
                name={ref.name}
                t={t}
              />
            </>
          )}
          {downloadAction}
        </div>
      )}
      {menu.menu}
      {menu.feedback}
    </div>
  );
}
