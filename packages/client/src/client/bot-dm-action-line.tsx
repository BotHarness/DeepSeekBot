import type { ReactElement, ReactNode } from 'react';
import { PersonaBotAvatar } from './avatar.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary } from './store.js';

const SENDER = '\uE000sender\uE000';
const RECIPIENT = '\uE000recipient\uE000';

function BotChip({
  slug,
  name,
  bots,
  t,
}: {
  slug: string;
  name: string;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement {
  const bot = bots.find((candidate) => candidate.slug === slug);
  return (
    <span className="bh-bot-dm-action-bot">
      <span className="bh-bot-dm-action-avatar" aria-hidden="true">
        <PersonaBotAvatar
          t={t}
          personaBotId={slug}
          name={name}
          src={bot?.avatar}
          appearance={bot?.appearance}
          avatarSeed={bot?.avatarSeed}
          size={16}
          indicator={false}
          still
        />
      </span>
      <span className="bh-bot-dm-action-name">{name}</span>
    </span>
  );
}

export function BotDmActionLabel({
  messageKey = 'botDm.action',
  senderSlug,
  senderName,
  recipientSlug,
  recipientName,
  bots,
  t,
}: {
  messageKey?: 'botDm.action' | 'botCreate.action';
  senderSlug: string | undefined;
  senderName: string;
  recipientSlug: string;
  recipientName: string;
  bots: readonly BotSummary[];
  t: BotHarnessTranslate;
}): ReactElement {
  const parts: ReactNode[] = t(messageKey, { sender: SENDER, recipient: RECIPIENT })
    .split(/(\uE000sender\uE000|\uE000recipient\uE000)/u)
    .filter((part) => part.length > 0)
    .map((part, index) =>
      part === SENDER ? (
        senderSlug === undefined ? (
          <span key={index} className="bh-bot-dm-action-name">
            {senderName}
          </span>
        ) : (
          <BotChip key={index} slug={senderSlug} name={senderName} bots={bots} t={t} />
        )
      ) : part === RECIPIENT ? (
        <BotChip key={index} slug={recipientSlug} name={recipientName} bots={bots} t={t} />
      ) : (
        <span key={index}>{part}</span>
      ),
    );
  return <span className="bh-bot-dm-action-label">{parts}</span>;
}
