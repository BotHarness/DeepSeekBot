import { type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import {
  Button,
  FileTypeIcon,
  IconDownloadOutlineRegular,
  fileSizeText,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';
import { channelAttachmentUrl } from './bridge.js';
import {
  HostFileOpenButton,
  useHostFileDefaultOpen,
  useHostFileMenu,
  type HostFileCommands,
} from './host-file-menu.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelAttachmentRef } from './store.js';
import { MessageAudio } from './message-audio.js';
import { galleryImageKey, SingleImageGallery } from './message-image-gallery.js';
import { useMessageResource } from './message-resource.js';
import { useMessageHost } from './message-host.js';
import { downloadFromUrl, useAttachmentDownloadMenu } from './attachment-download-menu.js';
import {
  inlineImageAttachment,
  MessageAlbum,
  useAttachmentCommands,
  type AttachmentActions,
} from './message-album.js';

export { inlineImageAttachment } from './message-album.js';

export type FileTone = 'red' | 'green' | 'blue' | 'orange' | 'violet' | 'gray';

const FILE_TONES: Readonly<Record<string, FileTone>> = {
  pdf: 'red',
  xls: 'green',
  xlsx: 'green',
  csv: 'green',
  numbers: 'green',
  doc: 'blue',
  docx: 'blue',
  pages: 'blue',
  rtf: 'blue',
  ppt: 'orange',
  pptx: 'orange',
  key: 'orange',
  zip: 'violet',
  rar: 'violet',
  '7z': 'violet',
  tar: 'violet',
  gz: 'violet',
};

export function fileTypeTile(name: string): { label: string; tone: FileTone } {
  const dot = name.lastIndexOf('.');
  const extension = dot <= 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase();
  return {
    label: extension.slice(0, 4).toUpperCase(),
    tone: FILE_TONES[extension] ?? 'gray',
  };
}

export function ClearedMessageAttachment({
  attachment: item,
  t,
}: {
  attachment: { name: string; size: number };
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div className="bh-message-file bh-message-file-cleared" data-cleared-attachment="">
      <span className="bh-message-file-main">
        <span className="bh-message-file-icon" aria-hidden="true">
          <FileTypeIcon path={item.name} size={28} />
        </span>
        <span className="bh-message-file-copy">
          <span className="bh-message-file-name" title={item.name}>
            {item.name}
          </span>
          <span className="bh-message-file-size">
            {t('message.attachment.cleared', { size: fileSizeText(item.size) })}
          </span>
        </span>
      </span>
    </div>
  );
}

function FileTile({ name }: { name: string }): ReactElement {
  const tile = fileTypeTile(name);
  return (
    <span
      className="bh-message-file-tile"
      data-file-tile=""
      data-file-tone={tile.tone}
      aria-hidden="true"
    >
      {tile.label === '' ? <FileTypeIcon path={name} size={20} /> : tile.label}
    </span>
  );
}

export function MessageAttachment({
  attachment: ref,
  channelId,
  messageId,
  actions,
  compact = false,
  trailingAction,
  displayName,
  durationMs,
  index,
  t,
}: {
  attachment: ChannelAttachmentRef;
  compact?: boolean;
  displayName?: string | undefined;
  durationMs?: number | undefined;
  trailingAction?: ReactNode;
  channelId?: string | undefined;
  messageId: string;
  actions?: AttachmentActions;
  index?: number | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  if (compact)
    return (
      <CompactAttachment
        attachment={ref}
        channelId={channelId}
        messageId={messageId}
        actions={actions}
        trailingAction={trailingAction}
        t={t}
      />
    );
  if (inlineImageAttachment(ref.mime))
    return (
      <MessageAlbum
        images={[ref]}
        channelId={channelId}
        messageId={messageId}
        actions={actions}
        indexOf={index === undefined ? undefined : () => index}
        t={t}
      />
    );
  return (
    <AttachmentRow
      attachment={ref}
      channelId={channelId}
      messageId={messageId}
      actions={actions}
      displayName={displayName}
      durationMs={durationMs}
      index={index}
      t={t}
    />
  );
}

function AttachmentRow({
  attachment: ref,
  channelId,
  messageId,
  actions,
  displayName,
  durationMs,
  index,
  t,
}: {
  attachment: ChannelAttachmentRef;
  channelId: string | undefined;
  messageId: string;
  actions: AttachmentActions;
  displayName: string | undefined;
  durationMs: number | undefined;
  index: number | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const host = useMessageHost();
  const commands = useAttachmentCommands(actions, messageId);
  const menu = useHostFileMenu(commands, channelId, t);
  const id = ref.fileId;
  const hostMenu = id !== undefined && commands !== undefined && channelId !== undefined;
  const opener = useHostFileDefaultOpen(hostMenu ? commands : undefined, channelId, id, menu, t);
  const resource = useMessageResource(
    channelId === undefined ? undefined : channelAttachmentUrl(ref, { channelId, messageId }),
    false,
  );
  const { url } = resource;
  const download =
    host === undefined
      ? url === undefined
        ? undefined
        : () => downloadFromUrl(url, ref.name)
      : () => void resource.download(ref.name);
  const fallback = useAttachmentDownloadMenu(hostMenu ? undefined : download, t);
  const audio = ref.mime.startsWith('audio/');
  const name = displayName ?? ref.name;
  const contextMenu = {
    onContextMenu: (event: MouseEvent<HTMLElement>) =>
      hostMenu ? menu.open(id, event) : fallback.open(event),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) =>
      hostMenu ? menu.onKey(id, event) : fallback.onKey(event),
  };
  if (resource.failed)
    return (
      <div role="status">
        {t('bridgeMedia.unavailable')}{' '}
        <Button type="button" variant="toolbar" size="sm" onClick={resource.retry}>
          {t('bridgeMedia.retry')}
        </Button>
      </div>
    );
  if (audio)
    return (
      <div className="bh-message-attachment" data-attachment-index={index} {...contextMenu}>
        <MessageAudio
          name={name}
          seed={`${ref.name}:${ref.size}`}
          durationMs={durationMs}
          url={url}
          onPrepare={host === undefined ? undefined : resource.prepare}
          t={t}
        />
        {menu.menu}
        {menu.feedback}
        {fallback.menu}
      </div>
    );
  const tile = fileTypeTile(ref.name);
  const contents = (
    <>
      <FileTile name={ref.name} />
      <span className="bh-message-file-copy">
        <span className="bh-message-file-name" title={ref.name}>
          {ref.name}
        </span>
        <span className="bh-message-file-size">
          {tile.label === '' ? fileSizeText(ref.size) : `${fileSizeText(ref.size)} · ${tile.label}`}
        </span>
      </span>
    </>
  );
  return (
    <div className="bh-message-attachment" data-attachment-index={index} {...contextMenu}>
      <div className="bh-message-file bh-message-file-row">
        {hostMenu ? (
          <button
            type="button"
            className="bh-message-file-main"
            aria-label={`${t('fileAction.open')}: ${ref.name}`}
            aria-busy={opener.busy || undefined}
            onClick={(event) => void opener.open(event.currentTarget)}
          >
            {contents}
          </button>
        ) : host === undefined ? (
          <a className="bh-message-file-main" href={url} download={ref.name}>
            {contents}
          </a>
        ) : (
          <button
            type="button"
            className="bh-message-file-main"
            aria-label={`${t('fileAction.download')}: ${ref.name}`}
            disabled={resource.loading}
            onClick={() => void resource.download(ref.name)}
          >
            {contents}
          </button>
        )}
      </div>
      {menu.menu}
      {menu.feedback}
      {fallback.menu}
    </div>
  );
}

function CompactAttachment({
  attachment: ref,
  channelId,
  messageId,
  actions,
  trailingAction,
  t,
}: {
  attachment: ChannelAttachmentRef;
  channelId: string | undefined;
  messageId: string;
  actions: AttachmentActions;
  trailingAction: ReactNode;
  t: BotHarnessTranslate;
}): ReactElement {
  const host = useMessageHost();
  const commands: HostFileCommands | undefined = useAttachmentCommands(actions, messageId);
  const menu = useHostFileMenu(commands, channelId, t);
  const id = ref.fileId;
  const image = inlineImageAttachment(ref.mime);
  const resource = useMessageResource(
    channelId !== undefined
      ? channelAttachmentUrl(ref, { channelId, messageId }, image ? '800' : undefined)
      : undefined,
    image,
  );
  const { url } = resource;
  const original =
    host === undefined && channelId !== undefined
      ? channelAttachmentUrl(ref, { channelId, messageId })
      : url;
  if (resource.failed)
    return (
      <div role="status">
        {t('bridgeMedia.unavailable')}{' '}
        <Button type="button" variant="toolbar" size="sm" onClick={resource.retry}>
          {t('bridgeMedia.retry')}
        </Button>
      </div>
    );
  const contents = (
    <>
      <span className="bh-message-file-icon" aria-hidden="true">
        <FileTypeIcon path={ref.name} size={16} />
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
    url === undefined && host === undefined ? null : (
      <>
        <span className="bh-message-file-divider" aria-hidden="true" />
        <Tooltip label={t('fileAction.download')} side="bottom" delayMs={500}>
          {host === undefined ? (
            <a
              className="bh-message-file-download"
              href={url}
              download={ref.name}
              aria-label={`${t('fileAction.download')}: ${ref.name}`}
              onClick={(event) => event.stopPropagation()}
            >
              <IconDownloadOutlineRegular size={16} />
            </a>
          ) : (
            <Button
              type="button"
              variant="toolbar"
              size="sm"
              aria-label={`${t('fileAction.download')}: ${ref.name}`}
              disabled={resource.loading}
              onClick={() => void resource.download(ref.name)}
            >
              <IconDownloadOutlineRegular size={16} />
            </Button>
          )}
        </Tooltip>
      </>
    );
  return (
    <div
      className="bh-message-attachment"
      onContextMenu={id === undefined ? undefined : (event) => menu.open(id, event)}
      onKeyDown={id === undefined ? undefined : (event) => menu.onKey(id, event)}
    >
      <div className="bh-message-file">
        {id === undefined || (host !== undefined && commands === undefined) ? (
          host === undefined ? (
            <a className="bh-message-file-main" href={url} download={ref.name}>
              {contents}
            </a>
          ) : (
            <span className="bh-message-file-main">{contents}</span>
          )
        ) : image && url !== undefined ? (
          <SingleImageGallery t={t}>
            {(openAlone) => (
              <button
                type="button"
                className="bh-message-file-main"
                aria-label={t('message.image.open', { name: ref.name })}
                onClick={() =>
                  openAlone({
                    key: galleryImageKey(messageId, ref),
                    src: original ?? url,
                    alt: ref.name,
                  })
                }
              >
                {contents}
              </button>
            )}
          </SingleImageGallery>
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
        <span className="bh-channel-file-actions">
          {id === undefined || channelId === undefined || commands === undefined ? null : (
            <>
              <span className="bh-message-file-divider" aria-hidden="true" />
              <HostFileOpenButton
                compact
                actions={commands}
                slug={channelId}
                path={id}
                name={ref.name}
                t={t}
              />
            </>
          )}
          {downloadAction}
          {trailingAction}
        </span>
      </div>
      {menu.menu}
      {menu.feedback}
    </div>
  );
}
