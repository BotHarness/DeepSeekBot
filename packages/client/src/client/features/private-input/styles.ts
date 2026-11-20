import { space, text } from '../../ds/tokens.stylex.js';

export const privateInputCss = {
  messageCardActions: `.bh-message-card-actions { display: flex; flex-wrap: wrap; gap: ${space.x3}; padding-top: calc(var(--bh-chat-card-inset) - var(--bh-message-card-gap, var(--bh-chat-card-inset))); }
`,
  privateInputHeading: `.bh-private-input-heading { display: flex; align-items: center; justify-content: space-between; gap: ${space.x3}; }
.bh-private-input-state { margin-left: auto; }
.bh-private-input-card .bh-question-prompt { font-weight: ${text.regular}; white-space: pre-wrap; }
.bh-private-input-card .bh-note { line-height: ${text.metaLine}; color: var(--tobs-ink-secondary); }
.bh-takeover-card .bh-question-prompt { font-weight: ${text.strong}; white-space: pre-wrap; }
`,
};
