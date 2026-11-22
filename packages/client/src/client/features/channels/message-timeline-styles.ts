import { border, color, radius, size, space, text } from '../../ds/tokens.stylex.js';
import { ASSIGNMENT_SESSION_ICON, channelSidebarIconMask } from '../../channel-sidebar-icon.js';
import { channelFilesCss } from '../channel-files/styles.js';
import { channelsCss } from './styles.js';
import { timelineCss } from './timeline-styles.js';
import { sessionsCss } from '../sessions/styles.js';

const ASSIGNMENT_SESSION_MASK = channelSidebarIconMask(ASSIGNMENT_SESSION_ICON);

export const MESSAGE_TIMELINE_CSS = [
  timelineCss.chatLayout,
  `.bh-chat-body {
  mask-image: linear-gradient(to bottom, transparent, black min(var(--bh-chat-mask-top, ${space.x6}), 20%), black calc(100% - var(--bh-composer-overlay, 0px) - ${space.x6}), transparent calc(100% - var(--bh-composer-overlay, 0px)));
  mask-mode: alpha;
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  margin-bottom: calc(-1 * var(--bh-composer-overlay, 0px));
  --bh-chat-top-inset: 74px;
  --bh-code-sticky-top: calc(var(--bh-chat-mask-top, ${space.x6}) - var(--bh-chat-top-inset));
  padding: var(--bh-chat-top-inset) ${space.x5} calc(${space.x6} + var(--bh-companion-read-inset, 0px) + var(--bh-composer-overlay, 0px));
  overscroll-behavior: contain;
}
`,
  timelineCss.markdownCodeBlock,
  `.bh-timeline-top-sentinel,
.bh-timeline-newer-sentinel {
  min-height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
`,
  timelineCss.timelineTopSentinel,
  `.bh-message-day {
  width: fit-content;
  margin: ${space.x3} auto ${space.x5};
  padding: ${space.x1} ${space.x3};
  border-radius: 999px;
  background: var(--tobs-layer-elevated);
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
}
`,
  timelineCss.messageGroup,
  `/* The avatar rests at its group's last bubble and pins to the timeline's
   bottom edge while a taller group scrolls past, so the author stays visible.
   The sticky edge already sits inside .bh-chat-body's bottom padding. */
.bh-message-group-avatar {
  position: sticky;
  bottom: 0;
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: flex-end;
  border: 0;
  border-radius: ${radius.round};
  padding: 0;
  background: transparent;
}
.bh-message-group-avatar-link {
  display: flex;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: ${radius.round};
  background: transparent;
  outline: none;
}
`,
  timelineCss.messageGroupAvatarLink,
  `.bh-message-group-human-avatar {
  display: grid;
  place-items: center;
  overflow: hidden;
  width: 28px;
  height: 28px;
  border-radius: ${radius.round};
  background: var(--tobs-state-hover);
  color: var(--tobs-ink-primary);
}
.bh-message-group-human-avatar svg { width: 18px; height: 18px; }

/* Header working status: a visually hidden status region in the chat pane
   announces the same Bots, so this copy is hidden from assistive tech. */
.bh-header-working {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: ${space.x2};
  min-width: 0;
  padding-left: ${space.x3};
  border-left: ${border.hairline} solid ${color.divider};
  transform-origin: left center;
  animation: bh-header-working-enter 180ms var(--bh-ease-out) both;
}
.bh-header-working-avatars { flex-shrink: 0; }
.bh-header-working-summary {
  min-width: 0;
  overflow: hidden;
  color: var(--tobs-ink-tertiary);
  font-weight: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-conversation-title] > .bh-header-working-summary { display: block; }
html[data-botharness-motion='reduce'] .bh-header-working { animation-name: bh-fade-in; }
`,
  timelineCss.headerWorkingKeyframes,
  `.bh-message-group-avatar-link:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}
.bh-message-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  max-width: min(720px, calc(100% - 56px));
}
`,
  timelineCss.messageGroupMe,
  `.bh-bridge-source-author:hover {
  color: var(--tobs-ink-primary);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.bh-bridge-source-author:focus-visible {
  outline: ${border.focus} solid var(--tobs-accent-solid);
  outline-offset: 3px;
  border-radius: ${radius.sm};
}
.bh-bridge-source-modal {
  width: min(560px, 100%);
  max-height: 100%;
}
`,
  timelineCss.bridgeSourceFields,
  `.bh-bridge-source-fields > div {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(0, 3fr);
  gap: ${space.x4};
}
`,
  timelineCss.bridgeSourceFieldLabels,
  `.bh-bubble-failed-action:focus-visible {
  outline: ${border.focus} solid var(--tobs-ink-primary);
  outline-offset: 2px;
}
`,
  timelineCss.bubbleWrap,
  `.bh-bubble-enter {
  transform-origin: left bottom;
  animation: bh-bubble-enter 220ms var(--bh-ease-out) both;
}
.bh-message-group-me .bh-bubble-enter { transform-origin: right bottom; }
html[data-botharness-motion='reduce'] .bh-bubble-enter { animation-name: bh-fade-in; }
`,
  timelineCss.bubbleEnterKeyframes,
  `.bh-message-group-enter .bh-message-group-avatar {
  transform-origin: center bottom;
  animation: bh-avatar-enter 220ms var(--bh-ease-out) both;
}
.bh-message-group-enter .bh-message-identity {
  animation: bh-fade-in 220ms var(--bh-ease-out) both;
}
html[data-botharness-motion='reduce'] .bh-message-group-enter .bh-message-group-avatar {
  animation-name: bh-fade-in;
}
`,
  timelineCss.avatarEnterKeyframes,
  `/* Same rule as mobile: a lone single-line bubble is a pill on every corner; inside a
   group a single-line bubble keeps the multi-line radius so the stack reads as one shape. */
.bh-bubble.bh-bubble[data-single-line][data-group-position='solo'] {
  border-radius: 999px;
}
`,
  timelineCss.bubbleBadges,
  `.bh-reading {
  display: inline-flex;
  align-items: center;
  gap: ${space.x1};
  padding: ${space.x2} ${space.x3} ${space.x2} ${space.x2};
  border: ${border.focus} solid var(--tobs-layer-canvas);
  border-radius: 999px;
  background: ${color.surface};
  color: var(--tobs-ink-tertiary);
  pointer-events: auto;
}
`,
  timelineCss.stackAvatar,
  `.bh-stack-human {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  color: var(--tobs-ink-primary);
  font-size: calc(${text.metaSize} - ${space.x1});
  font-weight: ${text.strong};
}
`,
  timelineCss.stackMore,
  `[data-badge-motion='enter'] {
  animation: bh-badge-in 180ms var(--bh-ease-out) both;
}
[data-badge-motion='leave'] {
  animation: bh-badge-out 150ms var(--bh-ease-out) both;
  pointer-events: none;
}
/* A Bot that reads for only a moment never shows its chip: the chip waits 300ms
   before it fades in and is dropped if the reading ends first. Once shown it holds
   for 800ms before it leaves, so it never blinks out. */
.bh-reading[data-badge-motion='enter'] {
  animation-delay: 300ms;
}
.bh-reading[data-badge-motion='leave'] {
  animation-delay: 800ms;
}
html[data-botharness-motion='reduce'] [data-badge-motion='enter'] { animation-name: bh-fade-in; }
html[data-botharness-motion='reduce'] [data-badge-motion='leave'] { animation-name: bh-fade-out; }
`,
  timelineCss.badgeEnterKeyframes,
  `.bh-bubble-focused .bh-bubble {
  outline: ${border.focus} solid var(--bh-accent);
  outline-offset: 2px;
}
`,
  timelineCss.bubbleReplyThumb,
  `.bh-bubble-reply-thumb {
  display: block;
  width: 32px;
  height: 32px;
  border-radius: ${radius.xs};
  object-fit: cover;
  background: color-mix(in srgb, currentColor 13%, transparent);
}

`,
  channelFilesCss.bubbleContent,
  `/* Bound intrinsic attachment width too, so long filenames do not widen the bubble. */
.bh-message-attachments { display: grid; max-width: 320px; gap: ${space.x3}; margin-top: ${space.x3}; }
.bh-message-voice { max-width: 320px; }
`,
  channelFilesCss.messageVoice,
  `.bh-bridge-image { max-width: min(100%, 320px); }
`,
  channelFilesCss.bridgeImageButton,
  `.bh-bridge-image-button:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); outline-offset: 2px; }
.bh-bridge-image-state { display: flex; align-items: center; gap: ${space.x3}; min-height: 96px; color: var(--tobs-ink-secondary); }
`,
  channelFilesCss.bridgeImageExpanded,
  `.bh-message-image { display: block; max-width: 100%; max-height: 320px; border-radius: ${radius.md}; object-fit: contain; }
.bh-message-album { display: grid; gap: 0; width: 320px; max-width: 100%; overflow: hidden; border-radius: ${radius.md}; }
`,
  channelFilesCss.messageAlbumCell,
  `.bh-message-album-tile:focus-visible { outline: ${border.focus} solid var(--bh-accent); outline-offset: -2px; }
`,
  channelFilesCss.messageAlbumTile,
  `.bh-message-album-more { position: absolute; inset: 0; display: grid; place-items: center; background: color-mix(in srgb, black 55%, transparent); color: white; font-size: ${text.titleSize}; font-weight: ${text.strong}; pointer-events: none; }
.bh-message-file { display: flex; align-items: center; gap: ${space.x3}; min-width: 0; width: fit-content; max-width: min(100%, 320px); min-height: 52px; padding: ${space.x3} ${space.x3} ${space.x3} ${space.x4}; border: 0; border-radius: ${radius.md}; background: color-mix(in srgb, currentColor 6%, transparent); color: inherit; }
`,
  channelFilesCss.messageFile,
  `.bh-message-file-tile { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: ${radius.sm}; background: var(--bh-file-tone); color: white; font-size: ${text.metaSize}; font-weight: ${text.strong}; letter-spacing: 0.03em; line-height: 1; }
`,
  channelFilesCss.messageFileTile,
  `.bh-message-file-main:focus-visible, .bh-message-file-download:focus-visible, .bh-message-audio-play:focus-visible, .bh-message-audio-spectrum:focus-visible { outline: ${border.focus} solid currentColor; outline-offset: 2px; }
.bh-message-file-icon { display: grid; place-items: center; flex: none; width: 28px; height: 28px; }
`,
  channelFilesCss.messageFileCopy,
  `.bh-message-file-divider { flex: none; align-self: stretch; width: 1px; margin-block: ${space.x1}; background: var(--tobs-line-edge); }
.bh-message-file-download { display: grid; place-items: center; flex: none; width: 32px; height: 32px; border-radius: ${radius.sm}; color: inherit; text-decoration: none; }
`,
  channelFilesCss.messageFileDownload,
  `.bh-message-audio-play { display: grid; place-items: center; flex: none; width: 36px; height: 36px; padding: 0; border: 0; border-radius: ${radius.round}; corner-shape: round; background: ${color.accent}; color: ${color.onAccent}; cursor: pointer; }
`,
  channelFilesCss.bubbleMe,
  `.bh-message-audio-spectrum { display: flex; align-items: center; gap: ${space.x1}; height: 24px; padding: 0; border-radius: ${radius.xs}; cursor: pointer; touch-action: none; }
`,
  channelFilesCss.messageAudioSpectrum,
  `.bh-message-audio-bar { flex: none; width: 3px; border-radius: ${radius.xs}; background: color-mix(in srgb, currentColor 30%, transparent); }
`,
  channelFilesCss.messageAudioBar,
  timelineCss.bubbleSide,
  `.bh-bubble[data-bubble-media] {
  width: 320px;
  padding: 0;
  overflow: hidden;
}
`,
  timelineCss.bubble,
  `/* Narrow screens: inline copy/reply actions crowd the bubble, so they move
   into the long-press message menu and the bubble keeps the full width. */
@media (max-width: 640px) {
  .bh-bubble-toolbar {
    display: none;
  }
}
`,
  timelineCss.timelineJumpAnchor,
  `.bh-timeline-new {
  position: absolute;
  z-index: 2;
  bottom: ${space.x3};
  right: ${space.x4};
  max-width: calc(100% - ${space.x4} * 2);
  border: 0;
  border-radius: calc(${radius.panel} + ${space.x3});
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: ${size.row};
  height: ${size.row};
  box-sizing: border-box;
  padding: 0 ${space.x3};
  color: var(--bh-timeline-new-fg, var(--tobs-ink-secondary));
  background: var(--bh-timeline-new-bg, var(--tobs-layer-elevated));
  box-shadow: var(--tobs-elevation-1);
  opacity: 1;
  cursor: pointer;
  transition:
    background-color 200ms var(--ds-ease-in-out),
    color 200ms var(--ds-ease-in-out);
}
`,
  timelineCss.timelineNew,
  sessionsCss.sessionChrome,
  `.bh-inline-mention,
.bh-bubble-body-markdown a[href^="https://session.tobs.invalid/"] {
  border-radius: ${radius.xs};
  background: var(--tobs-state-pressed);
  color: var(--tobs-ink-primary);
  box-shadow: 0 0 0 1px var(--tobs-state-pressed);
}
`,
  channelsCss.inlineMentionSent,
  `a[href^="https://session.tobs.invalid/"]::before {
  content: '';
  display: inline-block;
  width: 14px;
  height: 14px;
  margin-right: ${space.x1};
  vertical-align: -2px;
  background: currentColor;
  -webkit-mask: ${ASSIGNMENT_SESSION_MASK} center / contain no-repeat;
  mask: ${ASSIGNMENT_SESSION_MASK} center / contain no-repeat;
}
.bh-inline-mention-link:hover,
.bh-bubble-body-markdown a[href^="https://session.tobs.invalid/"]:hover {
  background: var(--tobs-state-hover);
  box-shadow: 0 0 0 1px var(--tobs-state-hover);
}
.bh-inline-mention-link:focus-visible {
  outline: ${border.focus} solid currentColor;
  outline-offset: 2px;
}
.bh-bubble-me .bh-inline-mention {
  color: inherit;
  background: color-mix(in srgb, currentColor 14%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 14%, transparent);
}
`,
  channelsCss.bubbleMe,
  `.bh-bubble-me .bh-inline-mention-link:hover {
  background: color-mix(in srgb, currentColor 24%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 24%, transparent);
}
`,
].join('');
