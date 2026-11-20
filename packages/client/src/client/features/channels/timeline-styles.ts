import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const timelineCss = {
  chatLayout: `.bh-chat-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
}
.bh-chat-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  position: relative;
}
`,
  markdownCodeBlock: `.md-code-block > :first-child {
  top: var(--bh-code-sticky-top, 0px);
}
.bh-chat-empty {
  height: 100%;
}
`,
  timelineTopSentinel: `.bh-timeline-top-sentinel button,
.bh-timeline-newer-sentinel button {
  border: 0;
  background: transparent;
  color: var(--tobs-ink-secondary);
  cursor: pointer;
}
.bh-timeline-top-sentinel button:hover,
.bh-timeline-newer-sentinel button:hover {
  color: var(--tobs-ink-primary);
}
.bh-message-block[data-follows] {
  padding-top: ${space.x4};
}
.bh-timeline-chunk,
.bh-timeline-slot {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}
`,
  messageGroup: `.bh-message-group {
  display: flex;
  align-items: flex-end;
  gap: ${space.x3};
  min-width: 0;
}
.bh-message-group-me {
  justify-content: flex-end;
}
`,
  messageGroupAvatarLink: `.bh-message-group-avatar-link { cursor: pointer; }
`,
  headerWorkingKeyframes: `@keyframes bh-header-working-enter {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: none; }
}
@keyframes bh-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes bh-fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}
`,
  messageGroupMe: `.bh-message-group-me .bh-message-stack {
  align-items: flex-end;
}
.bh-message-identity {
  display: flex;
  align-items: baseline;
  gap: ${space.x2};
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  margin-bottom: ${space.x2};
}
.bh-bubble-author {
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
  margin: 0 0 0 ${space.x1};
}
.bh-root .bh-bridge-source-author {
  appearance: none;
  padding: 0;
  border: 0;
  background: none;
  font-family: inherit;
  font-size: ${text.metaSize};
  line-height: 1.5;
  text-align: left;
  max-width: 100%;
  overflow-wrap: anywhere;
  cursor: pointer;
}
`,
  bridgeSourceFields: `.bh-bridge-source-fields {
  display: grid;
  gap: ${space.x4};
  margin: 0;
}
`,
  bridgeSourceFieldLabels: `.bh-bridge-source-fields dt {
  color: var(--tobs-ink-secondary);
}
.bh-bridge-source-fields dd {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.bh-message-group-me .bh-bubble-author {
  margin: 0 ${space.x1} 0 0;
}
.bh-message-group-me .bh-message-identity {
  flex-direction: row-reverse;
}
.bh-bubble-wrap {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: ${space.x2};
  width: fit-content;
  max-width: 100%;
}
.bh-bubble-surface {
  position: relative;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
}
.bh-message-group-me .bh-bubble-surface {
  margin-left: auto;
}
.bh-bubble-delivery,
.bh-bubble-failed-action {
  position: absolute;
  right: calc(100% + ${space.x2});
  top: 50%;
  transform: translateY(-50%);
  white-space: nowrap;
}
.bh-bubble-delivery {
  color: ${color.fg};
  font-size: ${text.metaSize};
}
.bh-bubble-failed-action {
  flex: none;
  border: 0;
  padding: ${space.x1} 0;
  color: var(--tobs-status-danger-base);
  background: transparent;
  font-size: ${text.metaSize};
  cursor: pointer;
}
`,
  bubbleWrap: `.bh-bubble-wrap + .bh-bubble-wrap {
  margin-top: ${space.x1};
}
`,
  bubbleEnterKeyframes: `@keyframes bh-bubble-enter {
  from { opacity: 0; transform: scale(0.92); }
  to { opacity: 1; transform: none; }
}
`,
  avatarEnterKeyframes: `@keyframes bh-avatar-enter {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: none; }
}
.bh-bubble { --bh-bubble-radius: var(--tobs-style-radius-bubble); }
.bh-bubble[data-group-position='solo'],
.bh-bubble[data-group-position='last'] {
  border-bottom-left-radius: ${radius.sm};
}
.bh-bubble[data-group-position='first'] {
  border-bottom-left-radius: ${radius.sm};
}
.bh-bubble[data-group-position='middle'] {
  border-top-left-radius: ${radius.sm};
  border-bottom-left-radius: ${radius.sm};
}
.bh-bubble[data-group-position='last'] {
  border-top-left-radius: ${radius.sm};
}
.bh-message-group-me .bh-bubble[data-group-position='solo'] {
  border-bottom-left-radius: var(--bh-bubble-radius);
  border-bottom-right-radius: ${radius.sm};
}
.bh-message-group-me .bh-bubble[data-group-position='first'] {
  border-bottom-left-radius: var(--bh-bubble-radius);
  border-bottom-right-radius: ${radius.sm};
}
.bh-message-group-me .bh-bubble[data-group-position='middle'] {
  border-top-left-radius: var(--bh-bubble-radius);
  border-bottom-left-radius: var(--bh-bubble-radius);
  border-top-right-radius: ${radius.sm};
  border-bottom-right-radius: ${radius.sm};
}
.bh-message-group-me .bh-bubble[data-group-position='last'] {
  border-top-left-radius: var(--bh-bubble-radius);
  border-bottom-left-radius: var(--bh-bubble-radius);
  border-top-right-radius: ${radius.sm};
  border-bottom-right-radius: ${radius.sm};
}
`,
  bubbleBadges: `/* Reactions and live reading avatars hang over the bubble's bottom edge:
   reactions on the author's side, readers on the other. */
.bh-bubble-badges {
  position: absolute;
  z-index: 1;
  left: ${space.x4};
  right: ${space.x4};
  bottom: calc(-1 * ${space.x5});
  display: flex;
  align-items: center;
  gap: ${space.x2};
  pointer-events: none;
}
.bh-message-group-me .bh-bubble-badges {
  flex-direction: row-reverse;
}
/* Reactions take the author's side of the bubble's bottom edge and the reading chip the
   other side. */
.bh-bubble-badges .bh-reading {
  order: 1;
}
.bh-message-group-me .bh-bubble-badges .bh-reading {
  margin-right: auto;
}
.bh-message-stack > .bh-bubble-wrap:last-child,
.bh-message-group > .bh-message-group-avatar {
  margin-bottom: ${space.x2};
}
`,
  stackAvatar: `.bh-stack-avatar {
  display: inline-flex;
  flex: none;
  border-radius: ${radius.round};
  background: var(--tobs-layer-canvas);
  overflow: hidden;
}
.bh-stack-avatar + .bh-stack-avatar {
  margin-left: calc(-1 * ${space.x3});
}
.bh-reading .bh-stack-avatar {
  outline: ${border.hairline} solid ${color.surface};
}
`,
  stackMore: `.bh-stack-more {
  margin-left: ${space.x1};
  color: var(--tobs-ink-tertiary);
  font-size: ${text.metaSize};
  line-height: 1;
}
`,
  badgeEnterKeyframes: `@keyframes bh-badge-in {
  from { opacity: 0; transform: scale(0.9); }
  to { opacity: 1; transform: none; }
}
@keyframes bh-badge-out {
  from { opacity: 1; transform: none; }
  to { opacity: 0; transform: scale(0.9); }
}
.bh-message-group-me {
  --bh-bubble-me-fill: var(--bh-bubble-me-fill-light, color-mix(in srgb, ${color.accent} 90%, ${color.fg}));
  --bh-bubble-me-ink: var(--bh-bubble-me-ink-light, ${color.onAccent});
}
:root[data-bh-appearance="dark"] .bh-message-group-me {
  --bh-bubble-me-fill: var(--bh-bubble-me-fill-dark, ${color.accent});
  --bh-bubble-me-ink: var(--bh-bubble-me-ink-dark, ${color.onAccent});
}
`,
  bubbleReplyThumb: `.bh-bubble-reply-thumb {
  grid-row: 1 / span 2;
}
`,
  bubbleSide: `.bh-bubble-side {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
}
.bh-bubble-side .bh-delivery-trigger {
  position: static;
}
`,
  bubble: `.bh-bubble[data-bubble-media] > .bh-bubble-reply {
  width: calc(100% - 2 * ${space.x3});
  margin: ${space.x3} ${space.x3} ${space.x2};
}
.bh-bubble[data-bubble-media] .bh-message-album {
  width: 100%;
  border-radius: 0;
}
.bh-bubble[data-bubble-media] .bh-bubble-content > :not(.bh-message-album) {
  margin-inline: ${space.x4};
}
.bh-bubble[data-bubble-media] .bh-bubble-content > .bh-message-album + * {
  margin-top: ${space.x3};
}
.bh-bubble[data-bubble-media] .bh-bubble-content > :last-child:not(.bh-message-album) {
  margin-bottom: ${space.x3};
}
.bh-bubble-status {
  display: block;
  color: var(--tobs-ink-secondary);
  font-size: ${text.metaSize};
}
/* Hover actions float over the bubble's top-right edge so showing them never
   shifts the layout. The lane spans the bubble and right-aligns the pill; a
   Bot bubble narrower than the pill keeps it from spilling over the avatar.
   A toolbar mounts once the pointer moves over its bubble (or for every bubble
   once Tab is used) and stays mounted, hidden, after that. It is placed with
   bottom instead of a transform: a transform per message makes Chromium
   rebuild every bubble's compositing on each repaint. */
.bh-bubble-toolbar {
  position: absolute;
  z-index: 2;
  bottom: calc(100% - ${space.x3});
  left: 0;
  right: ${space.x3};
  display: flex;
  justify-content: safe flex-end;
  opacity: 0;
  pointer-events: none;
}
.bh-message-group-me .bh-bubble-toolbar {
  justify-content: flex-end;
}
.bh-bubble-wrap:hover .bh-bubble-toolbar,
.bh-bubble-wrap:focus-within .bh-bubble-toolbar,
.bh-bubble-toolbar:has([aria-expanded='true']) {
  opacity: 1;
}
.bh-bubble-wrap:hover .bh-bubble-actions,
.bh-bubble-wrap:focus-within .bh-bubble-actions,
.bh-bubble-toolbar:has([aria-expanded='true']) .bh-bubble-actions {
  pointer-events: auto;
}
.bh-bubble-wrap.bh-bubble-selecting .bh-bubble-toolbar {
  display: none;
}
`,
  timelineJumpAnchor: `.bh-timeline-jump-anchor {
  position: relative;
  flex: none;
  height: 0;
  z-index: 2;
}
`,
  timelineNew: `.bh-timeline-new:hover {
  color: var(--bh-timeline-new-fg, var(--tobs-ink-primary));
  background: color-mix(in srgb, var(--tobs-ink-primary) 6%, var(--bh-timeline-new-bg, var(--tobs-layer-elevated)));
}
.bh-timeline-new:active {
  color: var(--bh-timeline-new-fg, var(--tobs-ink-primary));
  background: color-mix(in srgb, var(--tobs-ink-primary) 12%, var(--bh-timeline-new-bg, var(--tobs-layer-elevated)));
}
.bh-timeline-new-count {
  color: inherit;
  font-size: ${text.metaSize};
  font-weight: ${text.strong};
  line-height: ${text.metaLine};
  font-variant-numeric: tabular-nums;
}
.bh-timeline-new:focus-visible { outline: ${border.focus} solid ${color.accent}; }

`,
};
