import type { ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';

import type { SessionTranscriptEnvelope, SessionTranscriptTrigger } from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

export const TRIGGER_ICONS: Record<SessionTranscriptTrigger, string> = {
  request: 'inbox',
  goal: 'target',
  agent: 'messages-square',
  team: 'users',
  subagent: 'bot',
  github: 'git-branch',
  webhook: 'globe',
  schedule: 'alarm-clock',
  job: 'list-checks',
  plugin: 'plug',
};

const ENVELOPE_ICONS: Record<SessionTranscriptEnvelope['kind'], string> = {
  'human-dm': 'message-square',
  group: 'hash',
  'bot-dm': 'bot',
  inbox: 'inbox',
  other: 'inbox',
};

const styles = stylex.create({
  label: {
    alignSelf: 'flex-end',
    display: 'flex',
    alignItems: 'center',
    gap: space.x1,
    marginTop: space.x3,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

export function SessionEnvelopeLabel({
  kind,
  t,
}: {
  kind: SessionTranscriptEnvelope['kind'];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <span data-transcript-envelope={kind} {...stylex.props(styles.label)}>
      <ChannelSidebarIcon name={ENVELOPE_ICONS[kind]} size={12} />
      {t(`sessions.detail.envelope.${kind}`)}
    </span>
  );
}
