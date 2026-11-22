import type { ReactElement } from 'react';
import { PersonaBotAvatar } from '../../avatar.js';
import { botNameSource, paintBotName } from '../../bot-primary-color.js';
import type { BotHarnessTranslate } from '../../locale.js';
import type { ChannelSummary } from '../../store.js';
import type { ComposerMentionCandidate } from './channel-composer.js';

export function renderComposerChannelOptions({
  channelOptions,
  activeMentionIndex,
  chooseChannel,
  locked,
}: {
  channelOptions: readonly ChannelSummary[];
  activeMentionIndex: number;
  chooseChannel: (candidate: ChannelSummary) => void;
  locked: boolean;
}): ReactElement {
  return (
    <div className="bh-mention-picker" role="listbox" aria-label="Reference a Group Channel">
      {channelOptions.map((candidate, index) => (
        <button
          key={candidate.id}
          type="button"
          className={`bh-mention-option${index === activeMentionIndex ? ' bh-mention-option-active' : ''}`}
          role="option"
          aria-selected={index === activeMentionIndex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => chooseChannel(candidate)}
          disabled={locked}
        >
          <span className="bh-mention-option-copy">
            <strong>#{candidate.name}</strong>
          </span>
        </button>
      ))}
    </div>
  );
}

export function renderComposerMentionOptions({
  candidates,
  activeMentionIndex,
  chooseMention,
  locked,
  allBotLabel,
  t,
}: {
  candidates: readonly ComposerMentionCandidate[];
  activeMentionIndex: number;
  chooseMention: (candidate: ComposerMentionCandidate) => void;
  locked: boolean;
  allBotLabel: string;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div className="bh-mention-picker" role="listbox" aria-label="Mention a PersonaBot">
      {candidates.map((candidate, index) =>
        'preview' in candidate ? (
          <button
            key="all-bots"
            type="button"
            className={`bh-mention-option${index === activeMentionIndex ? ' bh-mention-option-active' : ''}`}
            role="option"
            aria-selected={index === activeMentionIndex}
            disabled={locked || candidate.preview.recipients.length === 0}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => chooseMention(candidate)}
          >
            <span className="bh-mention-option-copy">
              <strong>@{allBotLabel}</strong>
              <small>{t('composer.allBotsScope')}</small>
            </span>
            <small className="bh-mention-option-id">
              {t('composer.allBotsCount', {
                count: candidate.preview.recipients.length,
              })}
            </small>
          </button>
        ) : (
          <button
            key={candidate.slug}
            type="button"
            className={`bh-mention-option${index === activeMentionIndex ? ' bh-mention-option-active' : ''}`}
            role="option"
            aria-selected={index === activeMentionIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => chooseMention(candidate)}
            disabled={locked}
          >
            <PersonaBotAvatar
              personaBotId={candidate.slug}
              name={candidate.displayName}
              src={candidate.avatar}
              appearance={candidate.appearance}
              avatarSeed={candidate.avatarSeed}
              size={28}
              indicator={false}
              t={t}
            />
            <span className="bh-mention-option-copy">
              <strong ref={(element) => paintBotName(element, botNameSource(candidate))}>
                {candidate.displayName}
              </strong>
              {candidate.roles.length > 0 ? <small>{candidate.roles.join(' · ')}</small> : null}
            </span>
          </button>
        ),
      )}
    </div>
  );
}
