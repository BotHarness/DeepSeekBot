import { useState, type ReactElement } from 'react';

import {
  bridgeSourceLabel,
  externalPlatformLabel,
  externalSenderLabel,
} from './bridge-source-label.js';
import { Modal } from './modal.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';

type BridgeOrigin = NonNullable<ChannelMessage['bridgeOrigin']>;

export function BridgeSourceDetails({
  origin,
  t,
}: {
  origin: BridgeOrigin;
  t: BotHarnessTranslate;
}): ReactElement {
  const rows = [
    [t('im.platformLabel'), externalPlatformLabel(origin.platform, t)],
    ...(origin.accountName ? [[t('im.receivingApp'), origin.accountName]] : []),
    ...(origin.accountRef ? [[t('im.receivingAppRef'), origin.accountRef]] : []),
    [t('im.conversationLabel'), origin.conversationName],
    [t('im.conversationId'), origin.conversationId],
    ...(origin.senderName ? [[t('im.senderNameLabel'), origin.senderName]] : []),
    [t('im.senderLabel'), origin.senderId],
    [t('im.externalMessageId'), origin.messageId],
    [t('im.sourceEventId'), origin.sourceEventId],
    ...(origin.threadId ? [[t('im.threadLabel'), origin.threadId]] : []),
  ];
  return (
    <dl className="bh-bridge-source-fields">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function BridgeSourceAuthor({
  origin,
  t,
}: {
  origin: BridgeOrigin;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const source = bridgeSourceLabel(origin, t);
  const sender = externalSenderLabel(origin, t);
  return (
    <>
      <button
        type="button"
        className="bh-bubble-author bh-bridge-source-author"
        aria-label={`${sender} · ${t('im.openOriginDetails', { source })}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {sender} · 【{source}】
      </button>
      {open ? (
        <Modal
          open
          title={t('im.originDetails')}
          description={source}
          closeLabel={t('common.close')}
          onClose={() => setOpen(false)}
          className="bh-bridge-source-modal"
        >
          <BridgeSourceDetails origin={origin} t={t} />
        </Modal>
      ) : null}
    </>
  );
}
